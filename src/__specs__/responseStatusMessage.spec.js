import ResponseStatusMessage from '../responseStatusMessage';

describe('ResponseStatusMessage', () => {
  describe('#hasAdvice', () => {
    describe('when status code is 403', () => {
      it('is true', () => {
        // eslint-disable-next-line no-unused-expressions
        expect(new ResponseStatusMessage({ code: 403, text: 'Forbidden' }).hasAdvice).to.be.true;
      });
    });

    describe('when status code is not 403', () => {
      describe('when status code is 200', () => {
        it('is false', () => {
          // eslint-disable-next-line no-unused-expressions
          expect(new ResponseStatusMessage({ code: 200, text: 'Success' }).hasAdvice).to.be.false;
        });
      });
    });
  });

  describe('#advice', () => {
    describe('when status code is 403', () => {
      it('returns advice for recovering from a Forbidden error', () => {
        expect(new ResponseStatusMessage({ code: 403, text: 'Forbidden' }).advice).
          to.equal('Was a valid API key provided for an organization & application you have access to?');
      });
    });

    describe('when status code is not 403', () => {
      describe('when status code is 200', () => {
        it('returns undefined', () => {
          // eslint-disable-next-line no-unused-expressions
          expect(new ResponseStatusMessage({ code: 200, text: 'Success' }).advice).to.be.undefined;
        });
      });
    });
  });

  describe('#toString', () => {
    describe('when status code is 403', () => {
      it('returns advice for recovering from a Forbidden error', () => {
        expect(new ResponseStatusMessage({ code: 403, text: 'Forbidden' }).toString()).
          to.equal('403 Forbidden - Was a valid API key provided for an organization & application you have access to?');
      });
    });

    describe('when status code is not 403', () => {
      describe('when status code is 200', () => {
        it('returns status code and status text', () => {
          expect(new ResponseStatusMessage({ code: 200, text: 'Success' }).toString()).to.equal('200 Success');
        });
      });
    });
  });
});
