use serde::Serialize;
use std::collections::HashMap;
use std::fs;

/// Parsed terminal theme — maps to the frontend Theme.terminal (xterm ITheme)
#[derive(Debug, Serialize, Clone)]
pub struct ImportedTheme {
    pub name: String,
    pub background: String,
    pub foreground: String,
    pub cursor: String,
    pub black: String,
    pub red: String,
    pub green: String,
    pub yellow: String,
    pub blue: String,
    pub magenta: String,
    pub cyan: String,
    pub white: String,
    pub bright_black: String,
    pub bright_red: String,
    pub bright_green: String,
    pub bright_yellow: String,
    pub bright_blue: String,
    pub bright_magenta: String,
    pub bright_cyan: String,
    pub bright_white: String,
}

fn rgb_to_hex(r: f64, g: f64, b: f64) -> String {
    format!(
        "#{:02x}{:02x}{:02x}",
        (r * 255.0).round() as u8,
        (g * 255.0).round() as u8,
        (b * 255.0).round() as u8,
    )
}

// ── iTerm2 .itermcolors parser ──

/// Parse an iTerm2 .itermcolors XML plist file.
/// The format is a plist dict where each color key (e.g. "Ansi 0 Color")
/// maps to a dict with "Red Component", "Green Component", "Blue Component" floats.
#[tauri::command]
pub fn import_iterm2_theme(path: String) -> Result<ImportedTheme, String> {
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {e}"))?;

    let colors = parse_iterm2_colors(&content)?;

    let get = |key: &str| -> Result<String, String> {
        colors
            .get(key)
            .cloned()
            .ok_or_else(|| format!("Missing color key: {key}"))
    };

    // Derive theme name from filename
    let name = std::path::Path::new(&path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("imported")
        .to_string();

    Ok(ImportedTheme {
        name,
        background: get("Background Color")?,
        foreground: get("Foreground Color")?,
        cursor: get("Cursor Color").unwrap_or_else(|_| get("Foreground Color").unwrap_or_default()),
        black: get("Ansi 0 Color")?,
        red: get("Ansi 1 Color")?,
        green: get("Ansi 2 Color")?,
        yellow: get("Ansi 3 Color")?,
        blue: get("Ansi 4 Color")?,
        magenta: get("Ansi 5 Color")?,
        cyan: get("Ansi 6 Color")?,
        white: get("Ansi 7 Color")?,
        bright_black: get("Ansi 8 Color")?,
        bright_red: get("Ansi 9 Color")?,
        bright_green: get("Ansi 10 Color")?,
        bright_yellow: get("Ansi 11 Color")?,
        bright_blue: get("Ansi 12 Color")?,
        bright_magenta: get("Ansi 13 Color")?,
        bright_cyan: get("Ansi 14 Color")?,
        bright_white: get("Ansi 15 Color")?,
    })
}

fn parse_iterm2_colors(xml: &str) -> Result<HashMap<String, String>, String> {
    let mut colors = HashMap::new();

    // Simple XML parser for iTerm2 plist format:
    // <key>Ansi 0 Color</key>
    // <dict>
    //   <key>Red Component</key><real>0.0</real>
    //   <key>Green Component</key><real>0.0</real>
    //   <key>Blue Component</key><real>0.0</real>
    // </dict>
    let lines: Vec<&str> = xml.lines().map(str::trim).collect();
    let mut i = 0;

    while i < lines.len() {
        // Look for a color key
        if let Some(color_name) = extract_tag_content(lines[i], "key") {
            if color_name.contains("Color") {
                // Next should be <dict> with RGB components
                i += 1;
                if i < lines.len() && lines[i].contains("<dict>") {
                    let mut r = 0.0_f64;
                    let mut g = 0.0_f64;
                    let mut b = 0.0_f64;
                    i += 1;

                    while i < lines.len() && !lines[i].contains("</dict>") {
                        if let Some(component_key) = extract_tag_content(lines[i], "key") {
                            let current_line_value = extract_tag_content(lines[i], "real");
                            let mut value = current_line_value;

                            if value.is_none() {
                                i += 1;
                                if i < lines.len() {
                                    value = extract_tag_content(lines[i], "real");
                                }
                            }

                            if let Some(val) = value {
                                if let Ok(v) = val.parse::<f64>() {
                                    match component_key.as_str() {
                                        "Red Component" => r = v,
                                        "Green Component" => g = v,
                                        "Blue Component" => b = v,
                                        _ => {}
                                    }
                                }
                            }
                        }
                        i += 1;
                    }

                    colors.insert(color_name, rgb_to_hex(r, g, b));
                }
            }
        }
        i += 1;
    }

    if colors.is_empty() {
        return Err("No color entries found in .itermcolors file".to_string());
    }

    Ok(colors)
}

fn extract_tag_content(line: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    if let Some(start) = line.find(&open) {
        if let Some(end) = line.find(&close) {
            let content = &line[start + open.len()..end];
            return Some(content.to_string());
        }
    }
    None
}

// ── Ghostty theme parser ──

/// Parse a Ghostty theme config file.
/// Format: key = value lines, e.g.:
///   palette = 0=#1d1f21
///   background = #282a2e
///   foreground = #c5c8c6
///   cursor-color = #c5c8c6
#[tauri::command]
pub fn import_ghostty_theme(path: String) -> Result<ImportedTheme, String> {
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {e}"))?;

    let mut palette: HashMap<u8, String> = HashMap::new();
    let mut background = String::new();
    let mut foreground = String::new();
    let mut cursor = String::new();

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let parts: Vec<&str> = line.splitn(2, '=').collect();
        if parts.len() != 2 {
            continue;
        }

        let key = parts[0].trim();
        let value = parts[1].trim();

        match key {
            "background" => background = normalize_hex(value),
            "foreground" => foreground = normalize_hex(value),
            "cursor-color" => cursor = normalize_hex(value),
            "palette" => {
                // palette = N=#hexcolor
                let palette_parts: Vec<&str> = value.splitn(2, '=').collect();
                if palette_parts.len() == 2 {
                    if let Ok(idx) = palette_parts[0].trim().parse::<u8>() {
                        palette.insert(idx, normalize_hex(palette_parts[1].trim()));
                    }
                }
            }
            _ => {}
        }
    }

    if background.is_empty() && foreground.is_empty() && palette.is_empty() {
        return Err("No valid theme entries found in Ghostty config".to_string());
    }

    let name = std::path::Path::new(&path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("imported")
        .to_string();

    let get_palette = |idx: u8| palette.get(&idx).cloned().unwrap_or_default();

    if cursor.is_empty() {
        cursor = foreground.clone();
    }

    Ok(ImportedTheme {
        name,
        background,
        foreground,
        cursor,
        black: get_palette(0),
        red: get_palette(1),
        green: get_palette(2),
        yellow: get_palette(3),
        blue: get_palette(4),
        magenta: get_palette(5),
        cyan: get_palette(6),
        white: get_palette(7),
        bright_black: get_palette(8),
        bright_red: get_palette(9),
        bright_green: get_palette(10),
        bright_yellow: get_palette(11),
        bright_blue: get_palette(12),
        bright_magenta: get_palette(13),
        bright_cyan: get_palette(14),
        bright_white: get_palette(15),
    })
}

fn normalize_hex(s: &str) -> String {
    let s = s.trim();
    if s.starts_with('#') {
        s.to_string()
    } else {
        format!("#{s}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_iterm2_basic() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN">
<plist version="1.0">
<dict>
    <key>Ansi 0 Color</key>
    <dict>
        <key>Red Component</key><real>0.0</real>
        <key>Green Component</key><real>0.0</real>
        <key>Blue Component</key><real>0.0</real>
    </dict>
    <key>Background Color</key>
    <dict>
        <key>Red Component</key><real>0.11764705882352941</real>
        <key>Green Component</key><real>0.11764705882352941</real>
        <key>Blue Component</key><real>0.1803921568627451</real>
    </dict>
    <key>Foreground Color</key>
    <dict>
        <key>Red Component</key><real>1.0</real>
        <key>Green Component</key><real>1.0</real>
        <key>Blue Component</key><real>1.0</real>
    </dict>
</dict>
</plist>"#;
        let colors = parse_iterm2_colors(xml).unwrap();
        assert_eq!(colors["Ansi 0 Color"], "#000000");
        assert_eq!(colors["Background Color"], "#1e1e2e");
        assert_eq!(colors["Foreground Color"], "#ffffff");
    }

    #[test]
    fn parse_ghostty_basic() {
        let result = import_ghostty_theme("/nonexistent".to_string());
        assert!(result.is_err());
    }
}
