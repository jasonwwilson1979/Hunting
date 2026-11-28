/* HuntMap — native.js
   Bridge for the Capacitor (iOS/Android) shell. On the web every function here
   falls back to the plain browser behaviour, so the same files run everywhere. */
(function () {
  'use strict';
  const H = window.Hunt;
  const N = H.Native = {};

  const cap = window.Capacitor || null;
  N.available = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  N.platform = (cap && typeof cap.getPlatform === 'function' && cap.getPlatform()) || 'web';
  N.plugins = (cap && cap.Plugins) || {};

  /**
   * A notification the OS shows even when the app is in the background - this is
   * what makes a geofence alert useful with the phone in a pocket. Falls back to
   * the Web Notification API, and quietly does nothing if neither is allowed.
   */
  N.notify = function (title, body) {
    const LN = N.plugins.LocalNotifications;
    if (N.available && LN && LN.schedule) {
      LN.requestPermissions().then(function (res) {
        if (res && res.display && res.display !== 'granted') return;
        return LN.schedule({
          notifications: [{
            id: Math.floor(Date.now() % 2147483000),
            title: title || 'HuntMap',
            body: body || '',
            schedule: { at: new Date(Date.now() + 400) },
            smallIcon: 'ic_stat_icon_config_sample'
          }]
        });
      }).catch(function () {});
      return true;
    }
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title || 'HuntMap', { body: body || '' });
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  };

  /** Ask for notification permission up front (called from the Fences panel). */
  N.requestNotifications = function () {
    const LN = N.plugins.LocalNotifications;
    if (N.available && LN && LN.requestPermissions) return LN.requestPermissions();
    if ('Notification' in window && Notification.permission === 'default') {
      return Notification.requestPermission();
    }
    return Promise.resolve(null);
  };

  /** The native geolocation plugin, when present (better background behaviour). */
  N.geolocation = N.available && N.plugins.Geolocation ? N.plugins.Geolocation : null;

  N.describe = function () {
    if (!N.available) return '';
    return (N.platform === 'ios' ? 'iOS' : N.platform === 'android' ? 'Android' : N.platform) +
      ' app \u00b7 offline';
  };
})();
