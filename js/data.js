/* HuntMap — data.js
   Waypoints, tracks, map layers and settings: in-memory state + persistence,
   GPX import/export and JSON backup/restore. */
(function () {
  'use strict';
  const H = window.Hunt;
  const D = H.Data = {};
  const U = H.Util, G = H.Geo, DB = H.DB;

  D.TYPES = {
    stand: { label: 'Treestand', code: 'ST', color: '#e2801f', icon: 'stand' },
    blind: { label: 'Ground blind', code: 'BL', color: '#c9a227', icon: 'blind' },
    building: { label: 'Building / cabin', code: 'BD', color: '#8fa1b0', icon: 'building' },
    deer: { label: 'Deer', code: 'DR', color: '#c98a3f', icon: 'deer' },
    bear: { label: 'Bear', code: 'BR', color: '#6f5a45', icon: 'bear' },
    turkey: { label: 'Turkey', code: 'TY', color: '#a8562f', icon: 'turkey' },
    cam: { label: 'Trail camera', code: 'CM', color: '#8ec46a', icon: 'cam' },
    water: { label: 'Water', code: 'H2O', color: '#4aa3d8', icon: 'water' },
    food: { label: 'Food plot', code: 'FD', color: '#9fae4a', icon: 'food' },
    sign: { label: 'Sign / scrape', code: 'SG', color: '#c58f2a', icon: 'sign' },
    track: { label: 'Track / rub', code: 'TR', color: '#b07a52', icon: 'track' },
    kill: { label: 'Kill site', code: 'K', color: '#d9534f', icon: 'kill' },
    camp: { label: 'Camp', code: 'CP', color: '#9b8bc4', icon: 'camp' },
    park: { label: 'Vehicle', code: 'V', color: '#7f8c8d', icon: 'park' },
    hazard: { label: 'Hazard', code: '!', color: '#e2513f', icon: 'hazard' },
    wp: { label: 'Waypoint', code: 'WP', color: '#e2801f', icon: 'pin' }
  };
  D.TYPE_ORDER = ['stand', 'blind', 'building', 'deer', 'bear', 'turkey', 'cam', 'water',
    'food', 'sign', 'track', 'kill', 'camp', 'park', 'hazard', 'wp'];

  /* Line-art icons, 24x24, drawn as SVG. Used on the small type chips, where a
     filled silhouette turns to mush at 15 px; the map and the list use D.SHAPES. */
  D.ICON_PATHS = {
    stand: '<path d="M8.5 20.5V7.5h7v13"/><path d="M6.5 7.5h11"/><path d="M8.5 11h7M8.5 14.5h7M8.5 18h7"/>',
    blind: '<path d="M3.5 19.5a8.5 8.5 0 0 1 17 0z"/><path d="M9.5 19.5V16h5v3.5"/><path d="M12 4.5V7"/>',
    building: '<path d="M3.5 20V10L12 4l8.5 6v10z"/><path d="M9.5 20v-6h5v6"/>',
    deer: '<path d="M12 13.6a3.3 3.3 0 1 1 0 6.6 3.3 3.3 0 0 1 0-6.6z"/><path d="M9.4 14.2 6.8 11M14.6 14.2 17.2 11"/><path d="M6.8 11 4 10.2M6.8 11l.6-2.6M17.2 11l2.8-.8M17.2 11l-.6-2.6"/>',
    bear: '<path d="M12 11a5.4 5.4 0 1 1 0 10.8A5.4 5.4 0 0 1 12 11z"/><path d="M6.6 8.2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/><path d="M17.4 8.2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/><path d="M12 16.4v.01"/>',
    turkey: '<path d="M9.5 13.5a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2z"/><path d="M13.1 15.4 20 8.5M17 4.5l3.5 3.5-3.5 3.5"/><path d="M7.2 17.1h-3M7.6 14.6 5.2 12.6"/>',
    cam: '<rect x="3.5" y="7.5" width="17" height="10" rx="2"/><path d="M12 10.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z"/><path d="M6.4 10.2v.01"/>',
    water: '<path d="M12 3.5c3.4 4 5.8 6.9 5.8 9.4a5.8 5.8 0 1 1-11.6 0c0-2.5 2.4-5.4 5.8-9.4z"/>',
    food: '<path d="M12 20.5v-7.7"/><path d="M12 12.8C8.4 12.8 6 10.6 6 7.2c3.6 0 6 2.2 6 5.6z"/><path d="M12 12.8c3.6 0 6-2.2 6-5.6-3.6 0-6 2.2-6 5.6z"/>',
    sign: '<path d="M8.4 4.5c1.5 0 2.3 1.4 2.3 2.8 0 1.8-1.1 3-2.3 4.9-1.2-1.9-2.3-3.1-2.3-4.9 0-1.4.8-2.8 2.3-2.8z"/><path d="M15.6 9.5c1.5 0 2.3 1.4 2.3 2.8 0 1.8-1.1 3-2.3 4.9-1.2-1.9-2.3-3.1-2.3-4.9 0-1.4.8-2.8 2.3-2.8z"/>',
    track: '<path d="M5 19c2.5 0 3.5-2 5-4s3-3.5 5-3.5"/><path d="M8.2 6.6a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z"/><path d="M15.4 14.6a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z"/>',
    kill: '<path d="M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z"/><path d="m8.6 8.6 6.8 6.8M15.4 8.6l-6.8 6.8"/>',
    camp: '<path d="M3 19.5 12 4.5l9 15z"/><path d="M12 19.5v-4.8"/><path d="M3.5 19.5h17"/>',
    park: '<path d="M3.5 16.5v-4h9l2.8 3H21v4"/><path d="M3.5 16.5h17"/><path d="M6.8 18.9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/><path d="M17.2 18.9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>',
    hazard: '<path d="M12 3.5 22 20.5H2z"/><path d="M12 9.5v5M12 17.4v.01"/>',
    pin: '<path d="M12 21s6.5-6 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15 12 21 12 21z"/><path d="M12 12.2a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4z"/>'
  };

  /** Inline SVG line icon for a waypoint type (type chips, small headers). */
  D.iconFor = function (type, cls) {
    const info = D.TYPES[type] || D.TYPES.wp;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', cls || 'wp-ic');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = D.ICON_PATHS[info.icon] || D.ICON_PATHS.pin;
    return svg;
  };

  D.SHAPES = {
    stand: {
      /* ladder stand: platform + seat rail + ladder, with the tree beside it */
      fill: '<path fill-rule="evenodd" d="M4.4 8.9h12.4v1.9H4.4zM4.4 4.9h6.6v1.8H4.4z"/>' +
        '<path d="M18.9 2.9h2.0v18.6h-2.0z"/>',
      line: '<path d="M5.3 4.9v4.0M10.9 4.9v4.0M16.8 8.9v1.9"/>' +
        '<path d="M7.8 10.8v9.4M13.4 10.8v9.4M7.8 12.9h5.6M7.8 15.5h5.6M7.8 18.1h5.6"/>' +
        '<path d="M20.8 7.6l1.4-1.2M20.8 13.2l1.2-1.1" stroke-width="1.4"/>'
    },
    blind: {
      /* ground blind: dome with a door arch, two windows and brush at the base */
      fill: '<path fill-rule="evenodd" d="M3.0 19.4a9.0 9.0 0 0 1 18.0 0z' +
        'M9.8 19.4v-4.4c0-1.2 1.0-2.2 2.2-2.2s2.2 1.0 2.2 2.2v4.4z' +
        'M5.7 14.4h2.7v2.2H5.7zM15.6 14.4h2.7v2.2h-2.7z"/>',
      line: '<path d="M3.3 19.4l1.3-2.3M20.7 19.4l-1.3-2.3M6.2 19.4l1.0-1.8M17.8 19.4l-1.0-1.8" ' +
        'stroke-width="1.4"/>'
    },
    building: {
      /* cabin: pitched roof, chimney, door and two windows */
      fill: '<path fill-rule="evenodd" d="M2.6 20.7V9.9L12 2.7l9.4 7.2v10.8z' +
        'M9.8 20.7v-6.1h4.4v6.1zM5.3 11.5h2.9v2.9H5.3zM15.8 11.5h2.9v2.9h-2.9z"/>' +
        '<path d="M16.6 5.4h2.3v4.2h-2.3z"/>',
      line: '<path d="M13.1 17.2h.01M5.3 14.4h2.9" stroke-width="1.5"/>'
    },
    deer: {
      /* deer, facing left: branched antlers, muzzle, eye, four legs, tail */
      fill: '<path d="M9.9 11.6h4.8c2.4 0 4.1 1.6 4.3 3.9l.1 2.0H9.4l-.2-2.2c-.1-1.9.7-3.7.7-3.7z"/>' +
        '<path d="M9.6 12.8 8.2 7.9l2.1-.8 1.7 4.8z"/>' +
        '<path fill-rule="evenodd" d="M7.6 8.6c-.7-1.2-.3-2.4.8-2.8l2.4-.7.9 3.1-2.5 1.1z' +
        'M8.2 7.9a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z"/>' +
        '<path d="M8.0 7.1 5.5 8.2l2.3 1.0z"/>' +
        '<path d="M9.3 6.0 7.1 3.9l.7 3.1z"/>' +
        '<path d="M19.2 12.3l1.7 1.5-1.9.8z"/>',
      line: '<path d="M8.5 6.1 6.5 2.9M7.7 5.0 5.0 4.3M6.9 3.9 5.9 2.0M8.5 6.1 10.4 3.6M9.4 4.7 11.4 3.2"/>' +
        '<path d="M10.7 17.5v3.9M12.9 17.5v3.9M16.4 17.5v3.9M18.5 17.5v3.9" stroke-width="2.1"/>'
    },
    bear: {
      /* bear, facing left: hump, round ears, snout, short clawed legs */
      fill: '<path d="M8.7 11.9c.3-2.7 2.5-4.2 5.3-4.2l1.5.1c2.5.2 4.2 1.9 4.4 4.2l.2 2.4H8.3z"/>' +
        '<path fill-rule="evenodd" d="M7.2 11.6a3.5 3.5 0 1 1 0 7.0 3.5 3.5 0 0 1 0-7z' +
        'M6.1 14.0a.55.55 0 1 0 0-1.1.55.55 0 0 0 0 1.1z"/>' +
        '<path d="M4.8 13.1 2.8 13.9l2.1 1.3z"/>' +
        '<path fill-rule="evenodd" d="M5.7 9.3a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z' +
        'M5.7 10.4a.7.7 0 1 0 0 1.4.7.7 0 0 0 0-1.4z"/>' +
        '<path fill-rule="evenodd" d="M9.4 9.0a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z' +
        'M9.4 10.0a.65.65 0 1 0 0 1.3.65.65 0 0 0 0-1.3z"/>' +
        '<path d="M19.8 12.6l1.7 1.3-1.9.9z"/>',
      line: '<path d="M9.7 18.6v2.8M12.4 18.6v2.8M15.8 18.6v2.8M18.1 18.6v2.8" stroke-width="2.3"/>' +
        '<path d="M9.1 21.7l1.3-1.0M11.8 21.7l1.3-1.0M15.2 21.7l1.3-1.0M17.5 21.7l1.3-1.0" stroke-width="1.5"/>'
    },
    turkey: {
      /* turkey, facing left: five-feather fan, plump body, wattle, beard */
      fill: '<path d="M13.7 12.3 21.3 3.2l1.0 4.2z"/>' +
        '<path d="M14.3 12.9 22.7 6.8l.2 4.4z"/>' +
        '<path d="M14.6 13.7 23.1 10.6l-.6 4.3z"/>' +
        '<path d="M14.4 14.6 22.7 14.3l-1.5 4.1z"/>' +
        '<path d="M13.9 15.3 21.3 18.2l-2.3 3.5z"/>' +
        '<path d="M6.8 14.6a4.7 3.8 0 1 1 9.4 0 4.7 3.8 0 0 1-9.4 0z"/>' +
        '<path fill-rule="evenodd" d="M8.3 9.9a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8z' +
        'M7.8 11.0a.42.42 0 1 0 0-.84.42.42 0 0 0 0 .84z"/>' +
        '<path d="M9.6 10.6 9.0 13.6l2.3-.4z"/>' +
        '<path d="M6.7 10.0 4.6 10.7l2.0 1.0z"/>' +
        '<path d="M6.9 12.6l-.7 1.9 1.7-1.0z"/>',
      line: '<path d="M8.7 13.4c1.7 1.6 4.4 1.8 6.6.6" stroke-width="1.5"/>' +
        '<path d="M10.2 16.2v3.5" stroke-width="1.3"/>' +
        '<path d="M9.6 18.2v3.2M12.9 18.2v3.2M8.9 21.6h1.5M12.2 21.6h1.5" stroke-width="1.8"/>'
    },
    cam: {
      /* trail camera: body, lens rings, PIR window, IR lamps, strap, antenna */
      fill: '<path fill-rule="evenodd" d="M4.3 8.4h12.3a2.5 2.5 0 0 1 2.5 2.5v6.2a2.5 2.5 0 0 1-2.5 2.5H4.3z' +
        'M11.6 11.0a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6z' +
        'M11.6 12.2a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2z' +
        'M5.5 10.7h2.0v2.0h-2z"/>',
      line: '<path d="M19.1 9.7h2.6v7.6h-2.6"/>' +
        '<path d="M15.4 8.4V5.7M17.7 5.7l1.8-2.2" stroke-width="1.6"/>' +
        '<path d="M5.7 14.5h.01M7.3 14.5h.01M5.7 16.1h.01M7.3 16.1h.01" stroke-width="1.8"/>' +
        '<path d="M6.3 19.6v1.6M15.0 19.6v1.6" stroke-width="2"/>'
    },
    water: {
      fill: '<path fill-rule="evenodd" d="M12 2.9c3.9 4.7 6.3 7.8 6.3 10.6a6.3 6.3 0 0 1-12.6 0C5.7 10.7 8.1 7.6 12 2.9z' +
        'M10.0 12.4a1.5 1.5 0 1 0 1.7-2.4 1.7 1.7 0 0 0-1.7 2.4z"/>',
      line: ''
    },
    food: {
      /* food plot: three leaves, stem, soil line */
      fill: '<path d="M11.7 11.9C8.1 11.9 5.6 9.6 5.6 6.0c3.8 0 6.1 2.3 6.1 5.9z"/>' +
        '<path d="M12.3 11.9c3.6 0 6.1-2.3 6.1-5.9-3.8 0-6.1 2.3-6.1 5.9z"/>' +
        '<path d="M12 3.2c1.7 1.7 1.7 4.5 0 6.2-1.7-1.7-1.7-4.5 0-6.2z"/>',
      line: '<path d="M12 11.6v8.8" stroke-width="2.2"/>' +
        '<path d="M7.2 20.6h9.6" stroke-width="1.6"/>'
    },
    sign: {
      /* two cloven hoof prints, staggered with dewclaws - a deer trail */
      fill: '<path d="M7.4 2.6c.9 0 1.4 1.0 1.4 2.1 0 1.5-.7 2.5-1.4 4.0-.7-1.5-1.4-2.5-1.4-4.0 0-1.1.5-2.1 1.4-2.1z"/>' +
        '<path d="M10.4 2.6c.9 0 1.4 1.0 1.4 2.1 0 1.5-.7 2.5-1.4 4.0-.7-1.5-1.4-2.5-1.4-4.0 0-1.1.5-2.1 1.4-2.1z"/>' +
        '<path d="M6.8 10.0c.5 0 .8.5.8 1.1s-.4 1.2-.8 1.8c-.4-.6-.8-1.2-.8-1.8s.3-1.1.8-1.1z"/>' +
        '<path d="M11.0 10.0c.5 0 .8.5.8 1.1s-.4 1.2-.8 1.8c-.4-.6-.8-1.2-.8-1.8s.3-1.1.8-1.1z"/>' +
        '<path d="M13.3 11.2c.9 0 1.4 1.0 1.4 2.1 0 1.5-.7 2.5-1.4 4.0-.7-1.5-1.4-2.5-1.4-4.0 0-1.1.5-2.1 1.4-2.1z"/>' +
        '<path d="M16.3 11.2c.9 0 1.4 1.0 1.4 2.1 0 1.5-.7 2.5-1.4 4.0-.7-1.5-1.4-2.5-1.4-4.0 0-1.1.5-2.1 1.4-2.1z"/>' +
        '<path d="M12.7 18.6c.5 0 .8.5.8 1.1s-.4 1.2-.8 1.8c-.4-.6-.8-1.2-.8-1.8s.3-1.1.8-1.1z"/>' +
        '<path d="M16.9 18.6c.5 0 .8.5.8 1.1s-.4 1.2-.8 1.8c-.4-.6-.8-1.2-.8-1.8s.3-1.1.8-1.1z"/>',
      line: ''
    },
    track: {
      /* rub: tree trunk with two bark wounds, a broken branch, strips at the base */
      fill: '<path d="M9.1 2.6h5.2l.4 17.4H8.9z"/>' +
        '<path fill-rule="evenodd" d="M9.1 8.2l2.2-1.4 1.2 1.6-2.2 1.4zM9.0 13.2l2.4-1.5 1.2 1.6-2.4 1.5z"/>',
      line: '<path d="M14.3 6.4l2.9-2.7M14.4 9.2l1.7-.5" stroke-width="2.1"/>' +
        '<path d="M8.9 20.2l-2.1 1.7M11.8 20.4v1.8M14.7 20.2l2.1 1.7" stroke-width="1.4"/>'
    },
    kill: {
      /* impact site: target rings with a crosshair */
      fill: '<path fill-rule="evenodd" d="M12 3.4a8.6 8.6 0 1 1 0 17.2 8.6 8.6 0 0 1 0-17.2z' +
        'M12 6.4a5.6 5.6 0 1 0 0 11.2 5.6 5.6 0 0 0 0-11.2z"/>' +
        '<path d="M12 9.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z"/>',
      line: '<path d="M12 1.4v4.0M12 18.6v4.0M1.4 12h4.0M18.6 12h4.0" stroke-width="1.9"/>'
    },
    camp: {
      fill: '<path fill-rule="evenodd" d="M2.3 19.8 12 3.3l9.7 16.5zM12 19.8l-2.9-5.1h5.8z"/>',
      line: '<path d="M3.1 21.4h17.8" stroke-width="2"/>' +
        '<path d="M2.9 21.2 1.3 17.3M21.1 21.2l1.6-3.9" stroke-width="1.4"/>'
    },
    park: {
      /* vehicle: car body, windows, two wheels (reads at 46 px on a phone) */
      fill: '<path d="M2.6 15.6c0-1.3.9-2.2 2.2-2.2h1.5l2.2-3.2c.4-.6 1.1-1 1.8-1h4.5c.8 0 1.5.4 1.9 1l2.1 3.2h1.9c1.3 0 2.2.9 2.2 2.2v1.4H2.6z"/>' +
        '<path fill-rule="evenodd" d="M8.4 13.4l1.7-2.5h2.8v2.5zM13.6 10.9h2.0l1.6 2.5h-3.6z"/>' +
        '<path d="M6.7 18.8a2.3 2.3 0 1 1 0-4.6 2.3 2.3 0 0 1 0 4.6z"/>' +
        '<path d="M17.3 18.8a2.3 2.3 0 1 1 0-4.6 2.3 2.3 0 0 1 0 4.6z"/>',
      line: '<path d="M6.7 16.5a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2zM17.3 16.5a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2z" ' +
        'stroke-width="1.5"/>'
    },
    hazard: {
      fill: '<path fill-rule="evenodd" d="M12 2.5 22.7 21.5H1.3zM10.9 8.8h2.2v6.0h-2.2zM10.9 16.2h2.2v2.3h-2.2z"/>',
      line: ''
    },
    pin: {
      fill: '<path fill-rule="evenodd" d="M12 21.6S5.2 14.9 5.2 10.1a6.8 6.8 0 1 1 13.6 0C18.8 14.9 12 21.6 12 21.6z' +
        'M12 12.6a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>',
      line: ''
    }
  };

  /**
   * Silhouette as SVG markup.
   * opts: {color, size, halo (0/1), cls}. `currentColor` makes it follow CSS.
   */
  D.shapeSvg = function (type, opts) {
    opts = opts || {};
    const info = D.TYPES[type] || D.TYPES.wp;
    const shape = D.SHAPES[info.icon] || D.SHAPES.pin;
    const color = opts.color || info.color || '#e2801f';
    const size = opts.size || 24;
    const cls = opts.cls || 'wp-shape';
    const fill = shape.fill || '';
    const line = shape.line || '';
    let out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + size +
      '" height="' + size + '" class="' + cls + '" aria-hidden="true">';
    if (opts.halo) {
      // white outline under everything, so the silhouette reads on dark forest
      out += '<g fill="#fff" stroke="#fff" stroke-width="3.4" stroke-linecap="round" ' +
        'stroke-linejoin="round">' + fill + '</g>' +
        '<g fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" ' +
        'stroke-linejoin="round">' + line + '</g>';
    }
    out += '<g fill="' + color + '" fill-rule="evenodd">' + fill + '</g>' +
      '<g fill="none" stroke="' + color + '" stroke-width="1.9" stroke-linecap="round" ' +
      'stroke-linejoin="round">' + line + '</g></svg>';
    return out;
  };

  /** Silhouette as a DOM node, coloured by CSS (`color`) - used in spot rows. */
  D.shapeFor = function (type, cls) {
    const box = document.createElement('div');
    box.innerHTML = D.shapeSvg(type, { cls: cls || 'wp-shape', color: 'currentColor' });
    return box.firstChild;
  };

  /* Map pins need pixels, not DOM nodes: rasterise each silhouette once from an
     SVG data URL and cache it. Until it is ready the pin shows its letter code. */
  const pinIcons = {};
  D.pinIcon = function (type) {
    const info = D.TYPES[type] || D.TYPES.wp;
    const key = info.icon;
    if (Object.prototype.hasOwnProperty.call(pinIcons, key)) return pinIcons[key] || null;
    pinIcons[key] = null;
    const svg = D.shapeSvg(type, { size: 160, halo: true });
    const img = new Image();
    img.onload = function () {
      pinIcons[key] = img;
      if (D.onPinIconLoad) { try { D.onPinIconLoad(); } catch (e) { /* ignore */ } }
    };
    img.onerror = function () { pinIcons[key] = false; };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return null;
  };

  /* ---------------- modern marker: a soft rounded pin with a white glyph ----------------
     The silhouette alone is honest but looks dated on a phone. This is the modern
     shape: rounded body, gentle gradient, white border, drop shadow (added by the
     canvas) and the same silhouette knocked out in white, so a deer still reads as a
     deer. switchable: Settings -> "Modern map pins". */
  D.BADGE_PATH = 'M6.6 2.2h10.8a4.4 4.4 0 0 1 4.4 4.4v8.0a4.4 4.4 0 0 1-4.4 4.4h-2.7' +
    'L12 22.7l-2.7-3.7H6.6a4.4 4.4 0 0 1-4.4-4.4V6.6a4.4 4.4 0 0 1 4.4-4.4z';

  /** Lighten (pct > 0) or darken (pct < 0) a #rrggbb colour. */
  D.shade = function (hex, pct) {
    let h = String(hex || '#e2801f').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    const target = pct < 0 ? 0 : 255;
    const p = Math.abs(pct);
    const r = Math.round(((target - ((n >> 16) & 255)) * p) + ((n >> 16) & 255));
    const g = Math.round(((target - ((n >> 8) & 255)) * p) + ((n >> 8) & 255));
    const b = Math.round(((target - (n & 255)) * p) + (n & 255));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  };

  let badgeSeq = 0;
  D.badgeSvg = function (type, opts) {
    opts = opts || {};
    const info = D.TYPES[type] || D.TYPES.wp;
    const shape = D.SHAPES[info.icon] || D.SHAPES.pin;
    const size = opts.size || 24;
    const cls = opts.cls || 'wp-badge';
    const gid = 'hmbadge' + (++badgeSeq);
    const top = D.shade(info.color, 0.32);
    const bottom = D.shade(info.color, -0.14);
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + size +
      '" height="' + size + '" class="' + cls + '" aria-hidden="true">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + top + '"/><stop offset="1" stop-color="' + bottom + '"/>' +
      '</linearGradient></defs>' +
      '<path d="' + D.BADGE_PATH + '" fill="url(#' + gid + ')" stroke="rgba(255,255,255,.94)" ' +
      'stroke-width="1.4"/>' +
      '<g transform="translate(12 10.3) scale(0.56) translate(-12 -12)">' +
      '<g fill="#fff" fill-rule="evenodd">' + (shape.fill || '') + '</g>' +
      '<g fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" ' +
      'stroke-linejoin="round">' + (shape.line || '') + '</g>' +
      '</g></svg>';
  };

  /** The modern marker as a DOM node (list rows, legend). */
  D.badgeFor = function (type, cls) {
    const box = document.createElement('div');
    box.innerHTML = D.badgeSvg(type, { cls: cls || 'wp-badge', size: 24 });
    return box.firstChild;
  };

  const badgeIcons = {};
  D.pinBadge = function (type) {
    const info = D.TYPES[type] || D.TYPES.wp;
    const key = info.icon;
    if (Object.prototype.hasOwnProperty.call(badgeIcons, key)) return badgeIcons[key] || null;
    badgeIcons[key] = null;
    const img = new Image();
    img.onload = function () {
      badgeIcons[key] = img;
      if (D.onPinIconLoad) { try { D.onPinIconLoad(); } catch (e) { /* ignore */ } }
    };
    img.onerror = function () { badgeIcons[key] = false; };
    img.src = 'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(D.badgeSvg(type, { size: 192 }));
    return null;
  };

  D.DEFAULT_SETTINGS = {
    units: 'imperial', coordFormat: 'dd', night: false, awake: true, highAccuracy: true,
    labels: true, grid: false, trail: true,
    pinStyle: 'modern',       // modern rounded pins | classic silhouettes
    compassRose: true,        // small compass on the map
    zoneAlerts: true, zoneSound: true, zoneVibrate: true, zoneShow: true,
    provider: null,          // null = choose a sensible default for the location on first run
    tiles: true,
    lastView: null, targetId: null, selectedLayerId: null, helpSeen: false
  };

  D.waypoints = [];
  D.tracks = [];
  D.layers = [];
  D.settings = Object.assign({}, D.DEFAULT_SETTINGS);
  D.activeTrack = null;

  const TRACK_COLORS = ['#53c2d6', '#e2801f', '#8ec46a', '#c9a227', '#b07ad0', '#e2513f', '#4aa3d8'];

  /* ------------------------------- load ------------------------------- */
  D.load = function () {
    return DB.kvGet('settings', null).then(function (saved) {
      if (saved && typeof saved === 'object') D.settings = Object.assign({}, D.DEFAULT_SETTINGS, saved);
      return Promise.all([DB.getAll('waypoints'), DB.getAll('tracks'), DB.getAll('layers')]);
    }).then(function (res) {
      D.waypoints = (res[0] || []).filter(function (w) { return w && isFinite(w.lat) && isFinite(w.lon); });
      D.tracks = (res[1] || []).filter(function (t) { return t && t.points; });
      // Keep every stored map layer: a downloaded map that has not been
      // georeferenced yet must still be there after a reload (it is drawn only
      // once it has a calibration).
      D.layers = (res[2] || []).filter(function (l) { return l && l.id; });
      D.waypoints.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
      D.tracks.sort(function (a, b) { return (b.startedAt || 0) - (a.startedAt || 0); });
      return true;
    }).catch(function (e) {
      console.error('data load failed', e);
      return false;
    });
  };

  D.saveSettings = U.debounce(function () {
    DB.kvSet('settings', D.settings).catch(function () {});
  }, 400);
  D.saveSettingsNow = function () {
    return DB.kvSet('settings', D.settings).catch(function () {});
  };

  /* ----------------------------- waypoints ----------------------------- */
  D.newWaypoint = function (o) {
    o = o || {};
    return {
      id: U.uid('wp'),
      name: o.name || 'Spot',
      type: D.TYPES[o.type] ? o.type : 'wp',
      notes: o.notes || '',
      lat: o.lat, lon: o.lon,
      alt: o.alt == null ? null : o.alt,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  };

  D.saveWaypoint = function (w) {
    w.updatedAt = Date.now();
    const i = D.waypoints.findIndex(function (x) { return x.id === w.id; });
    if (i >= 0) D.waypoints[i] = w; else D.waypoints.push(w);
    D.waypoints.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    if (H.Sync) H.Sync.queueSync();
    return DB.put('waypoints', w).then(function () { return w; });
  };

  D.deleteWaypoint = function (id) {
    D.waypoints = D.waypoints.filter(function (w) { return w.id !== id; });
    if (D.settings.targetId === id) { D.settings.targetId = null; D.saveSettings(); }
    if (H.Sync) { H.Sync.markDeleted('spots', id); H.Sync.queueSync(); }
    return DB.del('waypoints', id);
  };

  /** Delete several spots at once (used by the Spots panel's select mode). */
  D.deleteWaypoints = function (ids) {
    ids = (ids || []).slice();
    if (!ids.length) return Promise.resolve(0);
    const gone = {};
    ids.forEach(function (id) { gone[id] = true; });
    D.waypoints = D.waypoints.filter(function (w) { return !gone[w.id]; });
    if (gone[D.settings.targetId]) { D.settings.targetId = null; D.saveSettings(); }
    if (H.Sync) {
      ids.forEach(function (id) { H.Sync.markDeleted('spots', id); });
      H.Sync.queueSync();
    }
    return Promise.all(ids.map(function (id) { return DB.del('waypoints', id); }))
      .then(function () { return ids.length; });
  };

  D.getWaypoint = function (id) { return D.waypoints.find(function (w) { return w.id === id; }) || null; };

  D.suggestName = function (type) {
    const info = D.TYPES[type] || D.TYPES.wp;
    const base = info.label.replace(/\s*\/.*$/, '');
    let n = 1;
    const used = D.waypoints.map(function (w) { return (w.name || '').toLowerCase(); });
    while (used.indexOf((base + ' ' + n).toLowerCase()) >= 0) n++;
    return base + ' ' + n;
  };

  D.sortedWaypoints = function (fromLat, fromLon, filter) {
    let list = D.waypoints.slice();
    if (filter) {
      const f = filter.toLowerCase();
      list = list.filter(function (w) {
        return (w.name || '').toLowerCase().indexOf(f) >= 0 ||
          (w.notes || '').toLowerCase().indexOf(f) >= 0 ||
          ((D.TYPES[w.type] || {}).label || '').toLowerCase().indexOf(f) >= 0;
      });
    }
    if (fromLat != null) {
      list.sort(function (a, b) {
        return G.distance(fromLat, fromLon, a.lat, a.lon) - G.distance(fromLat, fromLon, b.lat, b.lon);
      });
    }
    return list;
  };
  /* ------------------------------ tracks ------------------------------ */
  D.startTrack = function (name) {
    const now = new Date();
    const trk = {
      id: U.uid('trk'),
      name: name || ('Track ' + U.fmtDate(now) + ' ' + U.fmtTime(now)),
      color: TRACK_COLORS[D.tracks.length % TRACK_COLORS.length],
      startedAt: Date.now(),
      endedAt: null,
      points: [],
      active: true
    };
    D.tracks.unshift(trk);
    D.activeTrack = trk;
    return trk;
  };

  D.addTrackPoint = function (lat, lon, extra) {
    const trk = D.activeTrack;
    if (!trk) return false;
    const pts = trk.points;
    if (pts.length) {
      const last = pts[pts.length - 1];
      const d = G.distance(last.lat, last.lon, lat, lon);
      const dt = Date.now() - (last.t || 0);
      // Drop jitter while standing still; keep at least one point every 30 s.
      if (d < 2.5 && dt < 30000) return false;
    }
    pts.push({
      lat: lat, lon: lon, t: Date.now(),
      acc: extra && extra.accuracy != null ? Math.round(extra.accuracy) : null,
      alt: extra && extra.altitude != null ? Math.round(extra.altitude) : null
    });
    return true;
  };

  D.stopTrack = function () {
    const trk = D.activeTrack;
    if (!trk) return Promise.resolve(null);
    trk.active = false;
    trk.endedAt = Date.now();
    trk.updatedAt = Date.now();
    D.activeTrack = null;
    if (H.Sync) H.Sync.queueSync();
    return DB.put('tracks', JSON.parse(JSON.stringify(trk))).then(function () { return trk; });
  };

  D.saveTrack = U.debounce(function (trk) {
    if (!trk) return;
    DB.put('tracks', JSON.parse(JSON.stringify(trk))).catch(function () {});
  }, 3000);

  D.deleteTrack = function (id) {
    D.tracks = D.tracks.filter(function (t) { return t.id !== id; });
    if (D.activeTrack && D.activeTrack.id === id) D.activeTrack = null;
    if (H.Sync) { H.Sync.markDeleted('tracks', id); H.Sync.queueSync(); }
    return DB.del('tracks', id);
  };

  D.trackStats = function (trk) {
    const pts = (trk && trk.points) || [];
    let distance = 0, gain = 0, loss = 0;
    let maxAlt = -Infinity, minAlt = Infinity;
    for (let i = 1; i < pts.length; i++) {
      distance += G.distance(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
      if (pts[i].alt != null && pts[i - 1].alt != null) {
        const dz = pts[i].alt - pts[i - 1].alt;
        if (dz > 0) gain += dz; else loss -= dz;
        maxAlt = Math.max(maxAlt, pts[i].alt);
        minAlt = Math.min(minAlt, pts[i].alt);
      }
    }
    const start = trk.startedAt || (pts[0] && pts[0].t) || Date.now();
    const end = trk.endedAt || (pts.length ? pts[pts.length - 1].t : start);
    const duration = Math.max(0, end - start);
    return {
      distance: distance, duration: duration, gain: gain, loss: loss,
      maxAlt: isFinite(maxAlt) ? maxAlt : null, minAlt: isFinite(minAlt) ? minAlt : null,
      avgSpeed: duration > 0 ? distance / (duration / 1000) : 0,
      points: pts.length, start: start, end: end
    };
  };

  /* ------------------------------- layers ------------------------------- */
  D.newLayer = function (o) {
    return Object.assign({
      id: U.uid('map'),
      name: 'Map',
      kind: 'pdf',
      page: 1,
      imgW: 0, imgH: 0,
      calib: null,
      opacity: 0.92,
      visible: true,
      createdAt: Date.now()
    }, o || {});
  };

  D.saveLayer = function (layer) {
    const i = D.layers.findIndex(function (l) { return l.id === layer.id; });
    if (i >= 0) D.layers[i] = layer; else D.layers.push(layer);
    const plain = Object.assign({}, layer);
    delete plain.img;
    delete plain._loading;
    return DB.put('layers', plain).then(function () { return layer; });
  };

  D.deleteLayer = function (id) {
    D.layers = D.layers.filter(function (l) { return l.id !== id; });
    DB.del('layers', id).catch(function () {});
    DB.blobDel('mapimg:' + id).catch(function () {});
    DB.blobDel('mapfile:' + id).catch(function () {});
    if (D.settings.selectedLayerId === id) { D.settings.selectedLayerId = null; D.saveSettings(); }
  };

  D.visibleLayers = function () { return D.layers.filter(function (l) { return l.visible; }); };
  /* -------------------------------- GPX -------------------------------- */
  D.gpxOf = function (waypoints, tracks, name) {
    const esc = U.escapeHtml;
    const out = ['<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="HuntMap" xmlns="http://www.topografix.com/GPX/1/1">'];
    if (name) out.push('<metadata><name>' + esc(name) + '</name><time>' + new Date().toISOString() + '</time></metadata>');
    (waypoints || []).forEach(function (w) {
      out.push('<wpt lat="' + Number(w.lat).toFixed(7) + '" lon="' + Number(w.lon).toFixed(7) + '">' +
        '<name>' + esc(w.name || 'Waypoint') + '</name>' +
        (w.alt != null ? '<ele>' + Number(w.alt).toFixed(1) + '</ele>' : '') +
        (w.notes ? '<desc>' + esc(w.notes) + '</desc>' : '') +
        '<sym>' + esc((D.TYPES[w.type] || {}).label || 'Waypoint') + '</sym>' +
        '<time>' + new Date(w.createdAt || Date.now()).toISOString() + '</time></wpt>');
    });
    (tracks || []).forEach(function (t) {
      out.push('<trk><name>' + esc(t.name || 'Track') + '</name><trkseg>');
      (t.points || []).forEach(function (p) {
        out.push('<trkpt lat="' + Number(p.lat).toFixed(7) + '" lon="' + Number(p.lon).toFixed(7) + '">' +
          (p.alt != null ? '<ele>' + Number(p.alt).toFixed(1) + '</ele>' : '') +
          (p.t ? '<time>' + new Date(p.t).toISOString() + '</time>' : '') + '</trkpt>');
      });
      out.push('</trkseg></trk>');
    });
    out.push('</gpx>');
    return out.join('\n');
  };

  function textOf(el, tag) {
    const n = el.getElementsByTagName(tag)[0];
    return n ? (n.textContent || '').trim() : '';
  }
  function numOf(el, tag) {
    const v = parseFloat(textOf(el, tag));
    return isFinite(v) ? v : null;
  }

  D.parseGpx = function (text) {
    if (!text || text.indexOf('<gpx') < 0) throw new Error('This file is not a GPX file');
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('GPX file could not be parsed');
    const result = { waypoints: [], tracks: [] };

    const wpts = doc.getElementsByTagName('wpt');
    for (let i = 0; i < wpts.length; i++) {
      const el = wpts[i];
      const lat = parseFloat(el.getAttribute('lat')), lon = parseFloat(el.getAttribute('lon'));
      if (!isFinite(lat) || !isFinite(lon)) continue;
      const sym = textOf(el, 'sym');
      let type = 'wp';
      Object.keys(D.TYPES).forEach(function (k) {
        if (D.TYPES[k].label.toLowerCase() === sym.toLowerCase()) type = k;
      });
      result.waypoints.push(D.newWaypoint({
        name: textOf(el, 'name') || 'Imported waypoint',
        notes: [textOf(el, 'desc'), textOf(el, 'cmt')].filter(Boolean).join(' — '),
        lat: lat, lon: lon, alt: numOf(el, 'ele'), type: type
      }));
    }

    const trks = doc.getElementsByTagName('trk');
    for (let i = 0; i < trks.length; i++) {
      const trkEl = trks[i];
      const pts = [];
      const ptsEls = trkEl.getElementsByTagName('trkpt');
      for (let j = 0; j < ptsEls.length; j++) {
        const p = ptsEls[j];
        const lat = parseFloat(p.getAttribute('lat')), lon = parseFloat(p.getAttribute('lon'));
        if (!isFinite(lat) || !isFinite(lon)) continue;
        const t = Date.parse(textOf(p, 'time'));
        pts.push({ lat: lat, lon: lon, t: isFinite(t) ? t : Date.now(), alt: numOf(p, 'ele') });
      }
      if (pts.length > 1) {
        result.tracks.push({
          id: U.uid('trk'),
          name: textOf(trkEl, 'name') || 'Imported track',
          color: TRACK_COLORS[result.tracks.length % TRACK_COLORS.length],
          startedAt: pts[0].t,
          endedAt: pts[pts.length - 1].t,
          points: pts,
          active: false
        });
      }
    }

    if (!result.waypoints.length && !result.tracks.length) {
      // routes → single track fallback
      const rte = doc.getElementsByTagName('rte')[0];
      if (rte) {
        const pts = [];
        const rtepts = rte.getElementsByTagName('rtept');
        for (let i = 0; i < rtepts.length; i++) {
          const lat = parseFloat(rtepts[i].getAttribute('lat'));
          const lon = parseFloat(rtepts[i].getAttribute('lon'));
          if (isFinite(lat) && isFinite(lon)) pts.push({ lat: lat, lon: lon, t: Date.now() });
        }
        if (pts.length > 1) {
          result.tracks.push({ id: U.uid('trk'), name: textOf(rte, 'name') || 'Imported route',
            color: TRACK_COLORS[0], startedAt: pts[0].t, endedAt: pts[pts.length - 1].t,
            points: pts, active: false });
        }
      }
    }
    return result;
  };

  D.importGpx = function (parsed) {
    const jobs = [];
    parsed.waypoints.forEach(function (w) {
      D.waypoints.push(w);
      jobs.push(DB.put('waypoints', w));
    });
    parsed.tracks.forEach(function (t) {
      D.tracks.unshift(t);
      jobs.push(DB.put('tracks', t));
    });
    D.waypoints.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    return Promise.all(jobs).then(function () { return parsed; });
  };
  /* ---------------------------- backup / restore ---------------------------- */
  D.backup = function () {
    return {
      app: 'HuntMap',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: D.settings,
      waypoints: D.waypoints,
      tracks: D.tracks,
      zones: (H.Zones ? H.Zones.export() : []),
      layers: D.layers.map(function (l) {
        return {
          id: l.id, name: l.name, kind: l.kind, page: l.page,
          imgW: l.imgW, imgH: l.imgH, calib: l.calib,
          opacity: l.opacity, visible: l.visible, createdAt: l.createdAt
        };
      })
    };
  };

  D.restore = function (obj, mode) {
    if (!obj || obj.app !== 'HuntMap' || !Array.isArray(obj.waypoints)) {
      throw new Error('Not a HuntMap backup file');
    }
    const replace = mode === 'replace';
    if (replace) {
      D.waypoints = [];
      D.tracks = [];
      D.layers = [];
    }
    const jobs = [];

    if (H.Zones && Array.isArray(obj.zones)) {
      H.Zones.restore(obj.zones, replace);
    }

    (obj.waypoints || []).forEach(function (w) {
      if (!w || !isFinite(w.lat) || !isFinite(w.lon)) return;
      const wp = D.newWaypoint({
        name: w.name, type: w.type, notes: w.notes,
        lat: w.lat, lon: w.lon, alt: w.alt
      });
      wp.createdAt = w.createdAt || Date.now();
      D.waypoints.push(wp);
      jobs.push(wp);
    });

    const newTracks = [];
    (obj.tracks || []).forEach(function (t) {
      if (!t || !Array.isArray(t.points) || t.points.length < 2) return;
      const trk = {
        id: U.uid('trk'),
        name: t.name || 'Track',
        color: t.color || TRACK_COLORS[0],
        startedAt: t.startedAt || Date.now(),
        endedAt: t.endedAt || null,
        active: false,
        points: t.points.filter(function (p) { return p && isFinite(p.lat) && isFinite(p.lon); })
      };
      if (trk.points.length < 2) return;
      D.tracks.push(trk);
      newTracks.push(trk);
    });

    const newLayers = [];
    (obj.layers || []).forEach(function (l) {
      if (!l || !l.calib) return;
      const layer = D.newLayer({
        id: l.id || U.uid('map'), name: l.name || 'Map', kind: l.kind || 'pdf',
        page: l.page || 1, imgW: l.imgW, imgH: l.imgH,
        calib: l.calib, opacity: l.opacity, visible: false
      });
      D.layers.push(layer);
      newLayers.push(layer);
    });

    if (obj.settings && typeof obj.settings === 'object') {
      D.settings = Object.assign({}, D.settings, obj.settings);
    }
    D.waypoints.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });

    // Clear first, then write — separate transactions must not interleave.
    const clears = replace
      ? Promise.all([DB.clear('waypoints'), DB.clear('tracks'), DB.clear('layers')])
      : Promise.resolve();

    return clears.then(function () {
      const writes = jobs.map(function (w) { return DB.put('waypoints', w); })
        .concat(newTracks.map(function (t) { return DB.put('tracks', t); }))
        .concat(newLayers.map(function (l) {
          const plain = Object.assign({}, l);
          delete plain.img;
          return DB.put('layers', plain);
        }))
        .concat([D.saveSettingsNow()]);
      return Promise.all(writes).then(function () {
        return { waypoints: jobs.length, tracks: newTracks.length, layers: newLayers.length };
      });
    });
  };
})();




