const RESPONSE_STATUS_CODES_TO_ADVICE = Object.freeze({
  403: 'Was a valid API key provided for an organization & application you have access to?',
});

class ResponseStatusMessage {
  constructor({ code, text }) {
    this.code = code;
    this.text = text;
  }

  get advice() {
    return RESPONSE_STATUS_CODES_TO_ADVICE[this.code];
  }

  get hasAdvice() {
    return this.code in RESPONSE_STATUS_CODES_TO_ADVICE;
  }

  toString() {
    const formattedMessage = `${this.code} ${this.text}`;
    if (this.hasAdvice) {
      return `${formattedMessage} - ${this.advice}`;
    }
    return formattedMessage;
  }
}

export default ResponseStatusMessage;
