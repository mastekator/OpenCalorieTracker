import 'fake-indexeddb/auto';
// jsdom has no modal <dialog>: just the `open` attribute, enough for focus and role queries.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.open = true;
};
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.open = false;
};
