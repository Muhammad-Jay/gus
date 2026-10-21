import * as p from '@clack/prompts';

export class ProgressUI {
  private spinner = p.spinner();

  start(message: string) {
    this.spinner.start(message);
  }

  update(message: string) {
    this.spinner.message(message);
  }

  stop(message?: string) {
    this.spinner.stop(message);
  }
}
