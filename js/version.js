/* HuntMap version — one place for the app, the service worker and the UI.

   On every release: bump `app` and `shell` together, update `date`, add a
   CHANGELOG.md entry and tag the commit (`git tag -a v1.10.0`). `shell` is the
   service-worker cache name, so changing it throws away the old cached files. */
self.HUNTMAP_VERSION = {
  app: '1.12.0',
  date: '2026-11-27',
  shell: 'huntmap-shell-v1.12.0'
};
