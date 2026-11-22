import 'fake-indexeddb/auto';
// jsdom has no modal <dialog>: just the `open` attribute, enough for focus and role queries.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.open = true;
};
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.open = false;
};

// A full parallel run on a loaded CI runner renders slower than findBy*'s default 1 s.
import { configure } from '@testing-library/react';
configure({ asyncUtilTimeout: 3000 });
