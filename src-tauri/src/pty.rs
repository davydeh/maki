use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

struct PtySession {
    master: Mutex<Box<dyn portable_pty::MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn portable_pty::Child + Send>>,
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

    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let mut next_id = state.next_id.lock().unwrap();
    let session_id = *next_id;
    *next_id += 1;

    let session = Arc::new(PtySession {
        master: Mutex::new(pair.master),
        writer: Mutex::new(writer),
        child: Mutex::new(child),
    });

    state.sessions.lock().unwrap().insert(session_id, session);

    let sid = session_id;
    std::thread::spawn(move || {
        read_pty_output(reader, sid, app);
    });

    Ok(session_id)
}

fn read_pty_output(mut reader: Box<dyn Read + Send>, session_id: u32, app: AppHandle) {
    let mut buf = [0u8; 65536];
    // Carry-over buffer for incomplete UTF-8 sequences split across reads.
    // A UTF-8 character is at most 4 bytes, so 4 bytes is sufficient.
    let mut carry = [0u8; 4];
    let mut carry_len: usize = 0;

    loop {
        // Place any leftover bytes at the start of the buffer
        buf[..carry_len].copy_from_slice(&carry[..carry_len]);

        match reader.read(&mut buf[carry_len..]) {
            Ok(0) => {
                // Flush any remaining carry bytes (incomplete sequence at EOF)
                if carry_len > 0 {
                    let text = String::from_utf8_lossy(&buf[..carry_len]).into_owned();
                    let _ = app.emit("pty-output", &PtyOutput { session_id, data: text });
                }
                let _ = app.emit("pty-exit", PtyExit { session_id, exit_code: 0 });
                break;
            }
            Ok(n) => {
                let total = carry_len + n;
                carry_len = 0;

                // Find the last valid UTF-8 boundary. Walk backwards from the
                // end to find any incomplete multi-byte sequence.
                let valid_end = find_utf8_safe_boundary(&buf[..total]);
                let tail = total - valid_end;

                if tail > 0 && tail <= 4 {
                    // Save the incomplete trailing bytes for the next read
                    carry[..tail].copy_from_slice(&buf[valid_end..total]);
                    carry_len = tail;
                }

                if valid_end > 0 {
                    // Safety: valid_end is a valid UTF-8 boundary
                    let text = unsafe { std::str::from_utf8_unchecked(&buf[..valid_end]) };
                    let _ = app.emit("pty-output", &PtyOutput {
                        session_id,
                        data: text.to_owned(),
                    });
                }
            }
            Err(_) => {
                let _ = app.emit("pty-exit", PtyExit { session_id, exit_code: -1 });
                break;
            }
        }
    }
}

/// Find the largest prefix of `data` that is valid UTF-8. If the last few
/// bytes are the start of a multi-byte sequence that is incomplete, return
/// the position just before them so the caller can carry them to the next read.
fn find_utf8_safe_boundary(data: &[u8]) -> usize {
    // std::str::from_utf8 tells us where an error starts. We only need to
    // check the last 3 bytes at most (max UTF-8 char is 4 bytes).
    match std::str::from_utf8(data) {
        Ok(_) => data.len(), // All valid
        Err(e) => {
            let valid = e.valid_up_to();
            // Check if the error is an incomplete sequence at the very end
            // (as opposed to genuinely invalid bytes in the middle).
            if e.error_len().is_none() {
                // Incomplete sequence at end — return the valid prefix
                valid
            } else {
                // Invalid byte in the middle — include it (lossy) and keep going.
                // This handles genuinely malformed output by skipping bad bytes.
                // Find the next safe point after the bad byte(s).
                let skip = e.error_len().unwrap();
                let after = valid + skip;
                if after >= data.len() {
                    data.len()
                } else {
                    // Recursively find the boundary in the remaining data
                    after + find_utf8_safe_boundary(&data[after..])
                }
            }
        }
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
        let mut child = session.child.lock().unwrap();
        let _ = child.kill();
    }
    Ok(())
}
