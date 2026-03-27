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
    for arg in &args {
        cmd_builder.arg(arg);
    }
    cmd_builder.env("TERM", "xterm-256color");
    cmd_builder.env("COLORTERM", "truecolor");
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
    // 64KB buffer: large enough to capture a full TUI screen redraw in one read
    let mut buf = [0u8; 65536];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => {
                let _ = app.emit(
                    "pty-exit",
                    PtyExit {
                        session_id,
                        exit_code: 0,
                    },
                );
                break;
            }
            Ok(n) => {
                // Send as UTF-8 string directly -- avoids JSON number-array overhead
                // (lossy conversion handles rare non-UTF-8 bytes gracefully)
                let text = String::from_utf8_lossy(&buf[..n]).into_owned();
                let output = PtyOutput {
                    session_id,
                    data: text,
                };
                let _ = app.emit("pty-output", &output);
            }
            Err(_) => {
                let _ = app.emit(
                    "pty-exit",
                    PtyExit {
                        session_id,
                        exit_code: -1,
                    },
                );
                break;
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
