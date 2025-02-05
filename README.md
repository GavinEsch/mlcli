# MLCLI: Machine Learning Job Configuration CLI

![MLCLI](https://img.shields.io/badge/Version-0.1.3-blue.svg) ![Node.js](https://img.shields.io/badge/Node.js-%3E%3D14.0-brightgreen.svg) ![License](https://img.shields.io/badge/License-MIT-lightgrey.svg)

## Overview
MLCLI is a powerful command-line interface (CLI) tool designed for managing, tracking, searching, comparing, and exporting machine learning job configurations from Elastic (ESS). It provides version control, fuzzy search, color-coded diffing, and structured output for better usability.

### Features
✅ **Import job configurations** (only if changed, skipping duplicates)
✅ **Search jobs** (with exact and fuzzy matching)
✅ **Compare job versions** (color-coded diffing, summarized/full)
✅ **Export job data** (JSON, CSV, Markdown)
✅ **Configurable output settings** (custom columns, structured table display)

---

## Installation
### Prerequisites
- Node.js **14+**
- npm or yarn

### Install Globally
```sh
npm install -g mlcli
```

### Run in Local Project
```sh
git clone https://github.com/yourusername/mlcli.git
cd mlcli
npm install
```

---

## Usage
### General Command Syntax
```sh
mlcli <command> [options]
```

### 1️⃣ Import Jobs (Only If Changed)
```sh
mlcli import <file>
```
Imports ML job configurations from a JSON file **only if there are changes** compared to the latest version.

Example:
```sh
mlcli import jobs.json
```

---

### 2️⃣ Search Jobs (Fuzzy & Structured Output)
```sh
mlcli search [options]
```
**Options:**
- `--job-id <job_id>` → Filter by exact job ID.
- `--fuzzy <text>` → Perform fuzzy search across multiple fields.

Example:
```sh
mlcli search --fuzzy anomaly
```
Output is displayed in a **structured table**.

---

### 3️⃣ Compare Job Versions
```sh
mlcli compare [job_id] [options]
```
**Options:**
- `--full` → Show full detailed diff.
- `--all` → Compare all jobs.

Example:
```sh
mlcli compare job_123
```
Displays a **color-coded summary of differences** between the latest two versions of a job.

---

### 4️⃣ Export Jobs
```sh
mlcli export --format <json|csv|md> [--settings]
```
**Options:**
- `--format json` → Exports all job data in JSON format.
- `--format csv` → Exports job data in CSV format.
- `--format md` → Exports job data as a Markdown table.
- `--settings` → Uses user-defined column settings for CSV and Markdown exports.

Example:
```sh
mlcli export --format csv
```

---

### 5️⃣ Configure Visible Columns
```sh
mlcli settings --columns <column1,column2,...>
```
Allows users to configure **which columns** should be displayed in search results and exports.

Example:
```sh
mlcli settings --columns job_id,description,groups
```
To view available columns:
```sh
mlcli settings
```

---

### 6️⃣ Interactive Mode (REPL)
```sh
mlcli
```
Runs MLCLI in an **interactive shell** where you can enter commands continuously without re-running `mlcli` each time.

Example:
```sh
mlcli> search --fuzzy anomaly
mlcli> compare job_123
mlcli> export --format json
mlcli> exit
```

---

## Example Workflow
```sh
mlcli import jobs.json
mlcli search --fuzzy anomaly
mlcli compare job_123 --full
mlcli export --format csv
```

---

## Contributing
We welcome contributions! Please submit issues or pull requests via GitHub.

---

## License
This project is licensed under the MIT License.

