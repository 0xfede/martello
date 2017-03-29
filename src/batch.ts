const debug = require('debug')('loadtest');

export interface TestModule {
  (...args: any[]): Promise<Test>;
}

export interface Test {
  dispose?: () => Promise<any>;
  beforeEach?: () => Promise<any>;
  afterEach?: () => Promise<any>;
  run: () => Promise<any>;
}

export class BatchOptions {
  test: string;
  timeout?: number;
  iterations?: number;
  concurrent?: number;
  pacing?: number;
  args?: any[];
}

export class BatchResults {
  executed: number;
  succeeded: number;
  failed: number;
  totDuration: number;
  minDuration: number;
  maxDuration: number;
  avgDuration: number;
  results: any[];
  errors: any[];
}

export class BatchProgress {
  executed: number;
  succeeded: number;
  failed: number;
  totDuration: number;
  curDuration: number;
  result?: any;
  error?: any;
}

export class Batch {
  readonly module:TestModule;

  constructor(protected opts: BatchOptions) {
    if (typeof opts.timeout !== 'number' || opts.timeout < 0) {
      opts.timeout = 20000;
    }
    if (typeof opts.iterations !== 'number' || opts.iterations <= 0) {
      opts.iterations = 1;
    }
    if (typeof opts.concurrent !== 'number' || opts.concurrent <= 0) {
      opts.concurrent = 1;
    }
    if (typeof opts.pacing !== 'number' || opts.pacing < 0) {
      opts.pacing = 0;
    }
    this.module = require(this.opts.test) as TestModule;
  }
  run(progress?:(info:BatchProgress) => void): Promise<BatchResults> {
    let results: BatchResults = {
      executed: 0,
      succeeded: 0,
      failed: 0,
      totDuration: 0,
      minDuration: 0,
      maxDuration: 0,
      avgDuration: 0,
      results: [],
      errors: []
    };
    return this.module(...(this.opts.args || [])).then((test: Test) => {
      return new Promise(resolve => {
        let runnersLeft = this.opts.iterations;
        let runnersActive = 0;
        let runner = (): Promise<any> => {
          if (!runnersLeft) {
            results.avgDuration = results.totDuration / results.executed;
            return Promise.resolve();
          } else {
            runnersLeft--;
            runnersActive++;
            debug(`starting new runner, left ${runnersLeft}, active ${runnersActive}`);
            let r;
            if (test.beforeEach) {
              r = test.beforeEach();
            } else {
              r = Promise.resolve();
            }
            return r.then(() => new Promise((resolve, reject) => {
              let start = new Date();
              let t = setTimeout(() => reject(new Error('timeout')), this.opts.timeout);
              let info:BatchProgress = {
                executed: 0,
                succeeded: 0,
                failed: 0,
                totDuration: 0,
                curDuration: 0
              };
              test.run().then(result => {
                info.result = result;
                results.succeeded++;
                results.results.push(result);
              }, err => {
                info.error = err;
                results.failed++;
                results.results.push(err);
              }).then(() => {
                clearTimeout(t);
                runnersActive--;
                results.executed++;
                let end = new Date();
                let dur = +end - +start;
                debug(`completed runner in ${dur / 1000}s, left ${runnersLeft}, active ${runnersActive}`);
                results.totDuration += dur;
                if (!results.minDuration || dur < results.minDuration) {
                  results.minDuration = dur;
                }
                if (!results.maxDuration || dur > results.maxDuration) {
                  results.maxDuration = dur;
                }
                if (progress) {
                  info.executed = results.executed;
                  info.succeeded = results.succeeded;
                  info.failed = results.failed;
                  info.totDuration = results.totDuration;
                  info.curDuration = dur;
                  progress(info);
                }
              }).then(resolve, reject);
            }).then(() => {
              if (test.afterEach) {
                return test.afterEach();
              }
            })).then(runner);
          }
        };
        let concurrent = this.opts.concurrent || 1;
        if (concurrent === 1) {
          resolve(runner());
        } else {
          let runners: Promise<any>[] = [];
          for (let i = 0 ; i < concurrent ; i++) {
            runners.push(new Promise(resolve => {
              setTimeout(() => resolve(runner()), i * this.opts.pacing || 0);
            }));
          }
          resolve(Promise.all(runners));
        }
      }).then(() => {}, err => {
        results.errors.push(err);
      }).then(() => {
        if (test.dispose) {
          return test.dispose();
        }
      });
    }).then(() => {}, err => {
      results.errors.push(err);
    }).then(() => results);
  }
}