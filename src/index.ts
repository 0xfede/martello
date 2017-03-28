#!/usr/bin/env node

import { Batch } from './batch';

const program = require('commander');

program
  .version('1.0.0')
  .usage('[options] <module> -- [module args]')
  .option('-i, --iterations <n>', 'Number of tests to execute (default 1)', parseInt, 1)
  .option('-c, --concurrent <n>', 'Number of concurrent tests (default 1)', parseInt, 1)
  .option('-t, --timeout <ms>', 'Timeout per single test execution (default 2000)', parseInt, 2000)
  .parse(process.argv);

if (program.args.length < 1) {
  program.help();
}

let b = new Batch({
  test: process.cwd() + '/' + program.args[0],
  iterations: program.iterations || 1,
  concurrent: program.concurrent || 1,
  timeout: program.timeout || 2000,
  args: program.args.length > 1 ? program.args.slice(1) : []
});

b.run(data => {
  if (data.error) {
    process.stdout.write('x');
  } else {
    process.stdout.write('.');
  }
}).then(results => {
  process.stdout.write('\n');
  console.log(results);
  if (results.failed == 0) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});