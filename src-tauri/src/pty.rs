use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

struct PtySession {
    master: Mutex<Box<dyn portable_pty::MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn portable_pty::Child + Send>>,
    killer: Mutex<Box<dyn portable_pty::ChildKiller + Send + Sync>>,
}

// Safety: all fields are behind Mutex, so PtySession is Send + Sync
unsafe impl Sync for PtySession {}

#[derive(Default)]
pub struct PtyState {
    sessions: Mutex<HashMap<u32, Arc<PtySession>>>,
    next_id: Mutex<u32>,
}

#[derive(Serialize, Clone)]
pub struct PtyOutput {
    pub session_id: u32,
    pub data: String,
}

#[derive(Serialize, Clone)]
pub struct PtyExit {
    pub session_id: u32,
    pub exit_code: i32,
}

#[tauri::command]
pub fn spawn_pty(
    app: AppHandle,
    state: tauri::State<'_, PtyState>,
    cmd: String,
    args: Vec<String>,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
) -> Result<u32, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd_builder = CommandBuilder::new(&cmd);
    // Always spawn as login+interactive shell so both .zprofile AND .zshrc
    // are sourced. GUI apps on macOS get a minimal environment. -l sources
    // .zprofile (homebrew), -i sources .zshrc (nvm, pyenv, etc).
    cmd_builder.arg("-li");
    for arg in &args {
        cmd_builder.arg(arg);
    }
    cmd_builder.env("TERM", "xterm-256color");
    cmd_builder.env("COLORTERM", "truecolor");
    cmd_builder.env("LANG", "en_US.UTF-8");
    cmd_builder.env("LC_ALL", "en_US.UTF-8");
    cmd_builder.env("MAKI", "1");

    if let Some(extra_env) = env {
        for (k, v) in extra_env {
            cmd_builder.env(k, v);
        }
    }
    if let Some(dir) = cwd {
        cmd_builder.cwd(dir);
    }

    let child = pair
        .slave
        .spawn_command(cmd_builder)
        .map_err(|e| e.to_string())?;
    drop(pair.slave);
    let killer = child.clone_killer();

    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let mut next_id = state.next_id.lock().unwrap();
    let session_id = *next_id;
    *next_id += 1;

    let session = Arc::new(PtySession {
        master: Mutex::new(pair.master),
        writer: Mutex::new(writer),
        child: Mutex::new(child),
        killer: Mutex::new(killer),
    });

    state
        .sessions
        .lock()
        .unwrap()
        .insert(session_id, Arc::clone(&session));

    let sid = session_id;
    std::thread::spawn(move || {
        read_pty_output(reader, session, sid, app);
    });

    Ok(session_id)
}

fn read_pty_output(
    mut reader: Box<dyn Read + Send>,
    session: Arc<PtySession>,
    session_id: u32,
    app: AppHandle,
) {
    let mut buf = [0u8; 65536];
    let mut carry = Vec::with_capacity(4);

    loop {
        match reader.read(&mut buf) {
            Ok(0) => {
                if !carry.is_empty() {
                    let text = String::from_utf8_lossy(&carry).into_owned();
                    let _ = app.emit("pty-output", &PtyOutput { session_id, data: text });
                    carry.clear();
                }
                let _ = app.emit(
                    "pty-exit",
                    PtyExit {
                        session_id,
                        exit_code: wait_for_exit_code(&session),
                    },
                );
                break;
            }
            Ok(n) => {
                let text = decode_terminal_bytes(&buf[..n], &mut carry);
                if !text.is_empty() {
                    let _ = app.emit("pty-output", &PtyOutput {
                        session_id,
                        data: text,
                    });
                }
            }
            Err(_) => {
                let _ = app.emit(
                    "pty-exit",
                    PtyExit {
                        session_id,
                        exit_code: wait_for_exit_code(&session),
                    },
                );
                break;
            }
        }
    }
}

fn decode_terminal_bytes(data: &[u8], carry: &mut Vec<u8>) -> String {
    let mut combined = Vec::with_capacity(carry.len() + data.len());
    combined.extend_from_slice(carry);
    combined.extend_from_slice(data);
    carry.clear();

    let mut output = String::new();
    let mut cursor = 0;

    while cursor < combined.len() {
        match std::str::from_utf8(&combined[cursor..]) {
            Ok(valid) => {
                output.push_str(valid);
                break;
            }
            Err(error) => {
                let valid_up_to = error.valid_up_to();
                if valid_up_to > 0 {
                    let valid_end = cursor + valid_up_to;
                    let valid = std::str::from_utf8(&combined[cursor..valid_end])
                        .expect("utf-8 prefix validated by valid_up_to");
                    output.push_str(valid);
                    cursor = valid_end;
                }

                if let Some(error_len) = error.error_len() {
                    let invalid_end = cursor + error_len;
                    output.push_str(&String::from_utf8_lossy(&combined[cursor..invalid_end]));
                    cursor = invalid_end;
                } else {
                    carry.extend_from_slice(&combined[cursor..]);
                    break;
                }
            }
        }
    }

    output
}

fn wait_for_exit_code(session: &Arc<PtySession>) -> i32 {
    let mut child = session.child.lock().unwrap();
    exit_code_from_status(child.wait())
}

fn exit_code_from_status(status: io::Result<portable_pty::ExitStatus>) -> i32 {
    match status {
        Ok(exit_status) => exit_status.exit_code() as i32,
        Err(_) => -1,
    }
}

#[tauri::command]
pub fn write_pty(
    state: tauri::State<'_, PtyState>,
    session_id: u32,
    data: String,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    let session = sessions.get(&session_id).ok_or("Session not found")?;
    let mut writer = session.writer.lock().unwrap();
    writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn resize_pty(
    state: tauri::State<'_, PtyState>,
    session_id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    let session = sessions.get(&session_id).ok_or("Session not found")?;
    let master = session.master.lock().unwrap();
    master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn kill_pty(state: tauri::State<'_, PtyState>, session_id: u32) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.remove(&session_id) {
        let mut killer = session.killer.lock().unwrap();
        let _ = killer.kill();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use portable_pty::ExitStatus;

    #[test]
    fn decode_terminal_bytes_carries_incomplete_utf8_between_reads() {
        let mut carry = Vec::new();

        let first = decode_terminal_bytes(&[0xE2, 0x82], &mut carry);
        let second = decode_terminal_bytes(&[0xAC], &mut carry);

        assert_eq!(first, "");
        assert_eq!(second, "€");
        assert!(carry.is_empty());
    }

    #[test]
    fn decode_terminal_bytes_replaces_invalid_sequences_without_panic() {
        let mut carry = Vec::new();

        let decoded = decode_terminal_bytes(&[b'a', 0x80, b'b'], &mut carry);

        assert_eq!(decoded, "a\u{fffd}b");
        assert!(carry.is_empty());
    }

    #[test]
    fn exit_code_from_status_returns_real_exit_code() {
        assert_eq!(exit_code_from_status(Ok(ExitStatus::with_exit_code(7))), 7);
    }
}
