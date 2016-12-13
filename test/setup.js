import chai from 'chai';
import dirtyChai from 'dirty-chai';

chai.use(dirtyChai);
chai.config.includeStack = true;

// provide expect globally for ergonomics
global.expect = chai.expect;

global.mochaAsync = fn => {
  return async function mochaAsync(done) {
    try {
      await fn.call(this);
      done();
    } catch (err) {
      console.warn(err);
      done(err);
    }
  };
};
