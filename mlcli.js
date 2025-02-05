// Add these exports at the end of your mlcli.js file
export { importJobs, searchJobs, compareJobVersions, exportJobs }; // Replace with your actual function names#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import Table from 'cli-table3';
import Fuse from 'fuse.js';
import { parse as json2csv } from 'json2csv';
import * as markdownTable from 'markdown-table';
import { diffLines } from 'diff';
import { diffString } from 'json-diff';

const JOBS_DIR = path.join(process.cwd(), 'jobs');
const SETTINGS_FILE = path.join(process.cwd(), '.mlcli', 'settings.json');
const EXPORT_DIR = path.join(process.cwd(), 'exports');
fs.ensureDirSync(EXPORT_DIR);
fs.ensureDirSync(JOBS_DIR);
fs.ensureDirSync(path.dirname(SETTINGS_FILE));

function loadSettings() {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return { columns: [] }; // Default to empty columns
    }
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  }

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

const program = new Command();

// **Command: Import (Only if Changed)** 
program
  .command('import <file>')
  .description('Import multiple ML job configurations from a JSON file, only if changed')
  .action((file) => {
    try {
      const filePath = path.resolve(file);
      if (!fs.existsSync(filePath)) {
        console.error(chalk.red('Error: File does not exist'));
        process.exit(1);
      }

      const jobs = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!Array.isArray(jobs)) {
        console.error(chalk.red('Error: JSON must be an array of jobs.'));
        process.exit(1);
      }

      jobs.forEach(jobEntry => {
        if (!jobEntry.job || !jobEntry.job.job_id) {
          console.error(chalk.yellow('Skipping job: Missing job_id.'));
          return;
        }

        const jobId = jobEntry.job.job_id;
        const jobDir = path.join(JOBS_DIR, jobId);
        fs.ensureDirSync(jobDir);

        const latestFile = path.join(jobDir, 'latest.json');
        let isChanged = true;

        if (fs.existsSync(latestFile)) {
          const latestJobData = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
          isChanged = JSON.stringify(latestJobData) !== JSON.stringify(jobEntry);
        }

        if (isChanged) {
          const existingVersions = fs.readdirSync(jobDir).filter(f => f.startsWith('v')).length;
          const newVersion = existingVersions + 1;
          const newVersionFile = path.join(jobDir, `v${newVersion}.json`);

          fs.writeFileSync(newVersionFile, JSON.stringify(jobEntry, null, 2));
          fs.copySync(newVersionFile, latestFile);

          console.log(chalk.green(`Imported job ${jobId} (v${newVersion})`));
        } else {
          console.log(chalk.yellow(`No changes detected for job ${jobId}, skipping import.`));
        }
      });
    } catch (error) {
      console.error(chalk.red(`Import failed: ${error.message}`));
    }
  });

// **Command: Search (With Fuzzy Search)**
program
  .command('search')
  .description('Search for ML jobs and display results in a table')
  .option('--job-id <job_id>', 'Filter by job_id (exact match)')
  .option('--fuzzy <text>', 'Fuzzy search across job ID, description, and creator')
  .action((options) => {
    try {
      console.log(chalk.cyan('🔍 Running search...'));

      const settings = loadSettings();
      const selectedColumns = settings.columns;
      const jobDirs = fs.readdirSync(JOBS_DIR);
      let results = [];

      jobDirs.forEach((jobId) => {
        const jobFile = path.join(JOBS_DIR, jobId, 'latest.json');
        if (fs.existsSync(jobFile)) {
          const jobData = JSON.parse(fs.readFileSync(jobFile, 'utf8')).job;

          const jobEntry = {
            Job_ID: jobData.job_id,
            Description: jobData.description || 'N/A',
            Groups: jobData.groups?.join(', ') || 'N/A',
            Bucket_Span: jobData.analysis_config?.bucket_span || 'N/A',
            Created_By: jobData.custom_settings?.created_by || 'N/A',
            Model_Memory: jobData.analysis_limits?.model_memory_limit || 'N/A'
          };

          results.push(jobEntry);
        }
      });

      // **Fuzzy Search Implementation**
      if (options.fuzzy) {
        console.log(chalk.yellow(`🔍 Performing fuzzy search for: ${options.fuzzy}`));

        const fuse = new Fuse(results, {
          keys: ["Job_ID", "Description", "Created_By", "Groups"],
          threshold: 0.3,
        });

        results = fuse.search(options.fuzzy).map(result => result.item);
      }

      if (options.jobId) {
        results = results.filter(job => job.Job_ID === options.jobId);
      }

      if (results.length === 0) {
        console.log(chalk.yellow('⚠️ No jobs found matching criteria.'));
      } else {
        const tableHeaders = selectedColumns;
        const table = new Table({
          head: tableHeaders,
          colWidths: tableHeaders.map(() => 20)
        });

        results.forEach(job => {
          table.push(tableHeaders.map(header => job[header] || 'N/A'));
        });

        console.log(table.toString());
      }
    } catch (error) {
      console.error(chalk.red(`❌ Search failed: ${error.message}`));
    }
  });

// **Command: Compare Job Versions (Default: Latest vs Previous)**
// **Command: Compare Job Versions (Default: Summarized, Full Diff Optional, Compare All)**
program
  .command('compare [job_id]')
  .description('Compare versions of an ML job configuration. Defaults to latest vs previous if versions are not specified. Use --all to compare all jobs.')
  .option('--full', 'Show full diff view')
  .option('--all', 'Compare all jobs')
  .action((job_id, options) => {
    try {
      let jobsToCompare = [];

      if (options.all) {
        // Compare all jobs
        jobsToCompare = fs.readdirSync(JOBS_DIR).filter((dir) => fs.lstatSync(path.join(JOBS_DIR, dir)).isDirectory());
      } else {
        if (!job_id) {
          console.error(chalk.red(`Error: Please specify a job_id or use --all to compare all jobs.`));
          process.exit(1);
        }
        jobsToCompare = [job_id];
      }

      jobsToCompare.forEach((job_id, index) => {
        const jobDir = path.join(JOBS_DIR, job_id);
        if (!fs.existsSync(jobDir)) {
          console.error(chalk.red(`Error: Job ${job_id} does not exist.`));
          return;
        }

        // Get all version files and sort them
        const versionFiles = fs.readdirSync(jobDir)
          .filter(file => file.startsWith('v') && file.endsWith('.json'))
          .map(file => parseInt(file.match(/v(\d+)\.json/)[1]))
          .sort((a, b) => b - a); // Sort descending

        if (versionFiles.length < 2) {
          console.error(chalk.red(`Error: Not enough versions to compare for job ${job_id}.`));
          return;
        }

        const version1 = versionFiles[1];
        const version2 = versionFiles[0];

        const version1File = path.join(jobDir, `v${version1}.json`);
        const version2File = path.join(jobDir, `v${version2}.json`);

        if (!fs.existsSync(version1File) || !fs.existsSync(version2File)) {
          console.error(chalk.red(`Error: One or both specified versions do not exist for job ${job_id}`));
          return;
        }

        const jobData1 = JSON.parse(fs.readFileSync(version1File, 'utf8'));
        const jobData2 = JSON.parse(fs.readFileSync(version2File, 'utf8'));

        console.log(chalk.blue(`\n========== Comparing Job: ${job_id} ==========`));
        console.log(chalk.cyan(`🔍 Summarized Differences for Job ${job_id}:`));
        
        // Use json-diff for a cleaner summary
        const formattedDiff = diffString(jobData1, jobData2);
        console.log(chalk.yellow(formattedDiff || 'No differences found.'));

        if (options.full) {
          console.log(chalk.cyan(`📜 Full Diff View:`));
          diffLines(JSON.stringify(jobData1, null, 2), JSON.stringify(jobData2, null, 2))
            .forEach((part) => {
              const color = part.added ? chalk.green : part.removed ? chalk.red : chalk.gray;
              process.stdout.write(color(part.value));
            });
        }
        console.log(chalk.blue(`========== End of Comparison for ${job_id} ==========`));
      });
    } catch (error) {
      console.error(chalk.red(`Comparison failed: ${error.message}`));
    }
  });
// **Command: Export Jobs with Conditional Column Filtering**
// **Command: Export Jobs with Conditional Column Filtering**
program
  .command('export')
  .description('Export ML jobs in different formats')
  .option('--format <format>', 'Export format (json, csv, md)', 'json')
  .option('--settings', 'Use configured columns for CSV and Markdown exports')
  .action((options) => {
    try {
      const format = options.format.toLowerCase();
      const settings = loadSettings();
      const useSettings = options.settings && settings.columns.length > 0;
      const jobDirs = fs.readdirSync(JOBS_DIR);
      let jobs = [];

      jobDirs.forEach((jobId) => {
        const jobFile = path.join(JOBS_DIR, jobId, 'latest.json');
        if (fs.existsSync(jobFile)) {
          const fullJobData = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
          let jobEntry = { 
            job: fullJobData.job, 
            datafeed: fullJobData.datafeed || {} 
          };

          // Apply settings **only for CSV and Markdown** if `--settings` is used
          if (useSettings && (format === 'csv' || format === 'md')) {
            jobEntry = Object.fromEntries(
              Object.entries(jobEntry.job).filter(([key]) => settings.columns.includes(key))
            );
          }

          jobs.push(jobEntry);
        }
      });

      if (jobs.length === 0) {
        console.log(chalk.yellow('⚠️ No jobs found to export.'));
        process.exit(1);
      }

      let exportFile;
      let exportData;
      switch (format) {
        case 'json': // Always export full JSON
          exportFile = path.join(EXPORT_DIR, 'jobs.json');
          exportData = JSON.stringify(jobs, null, 2);
          break;
        case 'csv':
          exportFile = path.join(EXPORT_DIR, 'jobs.csv');
          exportData = json2csv(jobs);
          break;
        case 'md':
          exportFile = path.join(EXPORT_DIR, 'jobs.md');
          exportData = markdownTable.markdownTable([
            Object.keys(jobs[0]),
            ...jobs.map(job => Object.values(job))
          ]);
          break;
        default:
          console.error(chalk.red('❌ Invalid export format. Use json, csv, or md.'));
          process.exit(1);
      }

      fs.writeFileSync(exportFile, exportData);
      console.log(chalk.green(`✅ Jobs exported successfully to ${exportFile}`));
    } catch (error) {
      console.error(chalk.red(`Export failed: ${error.message}`));
    }
  });

// **Command: Settings (Configurable Columns)**
program
  .command('settings')
  .description('Configure mlcli settings')
  .option('--columns <columns>', 'Set visible columns (comma-separated list)')
  .action((options) => {
    let settings = loadSettings();

    if (options.columns) {
      settings.columns = options.columns.split(',').map(col => col.trim());
      saveSettings(settings);
      console.log(chalk.green(`✅ Updated visible columns: ${settings.columns.join(', ')}`));
    } else {
      console.log(chalk.cyan(`📌 Current settings:\nVisible columns: ${settings.columns.join(', ')}`));
    }
  });

program.parse(process.argv);

module.exports = {
  importJobs: importJobs, // ... other functions
};
module.exports.importJobs = importJobs;
module.exports.searchJobs = searchJobs;
// ... other functions
