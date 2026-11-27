// The demo never calls a model. The real adapter stays in the code but cannot run in the browser build.
export default class Anthropic {
  constructor() { throw new Error('No AI model is connected in the web demo'); }
}
