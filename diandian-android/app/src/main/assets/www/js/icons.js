/* 点点 — 内联 SVG 图标集（Material Symbols 风格，离线可用） */
(function () {
  'use strict';

  // 所有图标：24x24 viewBox，stroke 风格，inherit currentColor
  const ICONS = {
    menu: '<path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    close: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    arrow_back: '<path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    chevron_right: '<path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    settings: '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9L19 19M19 5l-2.1 2.1M7.1 16.9L5 19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    home: '<path d="M4 10.5L12 4l8 6.5V20h-5.5v-5.5h-5V20H4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="none"/>',
    insights: '<path d="M3 16l5-6 4 4 6-8 3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="3" cy="16" r="1.6" fill="currentColor"/><circle cx="8" cy="10" r="1.6" fill="currentColor"/><circle cx="12" cy="14" r="1.6" fill="currentColor"/><circle cx="18" cy="6" r="1.6" fill="currentColor"/><circle cx="21" cy="9" r="1.6" fill="currentColor"/>',
    add_circle: '<circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    person: '<circle cx="12" cy="8.2" r="3.6" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M4.5 20c1.2-3.6 4-5.2 7.5-5.2s6.3 1.6 7.5 5.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
    add: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    backspace: '<path d="M4 12l5-6h11v12H9z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="none"/><path d="M11 9.5l5 5M16 9.5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    schedule: '<circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    restaurant: '<path d="M8 3v7M11 3v7M8 10v11M11 10v11M5 3v4a3 3 0 003 3M17 3c-1.5 2-1.5 6 0 8v10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>',
    water_drop: '<path d="M12 3.5s6.5 6.4 6.5 11a6.5 6.5 0 11-13 0C5.5 9.9 12 3.5 12 3.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="none"/>',
    scale: '<path d="M5 5h14M12 5v3.5M7.5 21h9l1.2-6h-11.4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="none"/><path d="M12 14.5a2 2 0 100 4 2 2 0 000-4z" stroke="currentColor" stroke-width="1.6" fill="none"/>',
    download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M4 19h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    notifications_off: '<path d="M6.5 8.5A6.5 6.5 0 0118 10v4l2 3H4.5l2-3z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" fill="none"/><path d="M10 19a2 2 0 004 0M4 4l16 16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    notifications: '<path d="M6 10a6 6 0 0112 0v4.2l1.6 2.8H4.4L6 14.2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="none"/><path d="M10 19a2 2 0 004 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    arrow_downward: '<path d="M12 4v15M6 13l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    arrow_upward: '<path d="M12 20V5M6 11l6-6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    search: '<circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    edit: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 00-3-3L5 17z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" fill="none"/><path d="M13.5 6.5l3 3" stroke="currentColor" stroke-width="1.7"/>',
    delete: '<path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13M10 11v5M14 11v5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    history: '<path d="M4.5 12a7.5 7.5 0 107.5-7.5V2.5L8 6l4 3.5V7.5A5.5 5.5 0 1112 17.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none"/>',
    chevron_left: '<path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    chevron_right_big: '<path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    info: '<circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.7" fill="none"/><path d="M12 11v5M12 8v.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
    zoom_in: '<circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M16 16l4.5 4.5M11 8.5v5M8.5 11h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    zoom_out: '<circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M16 16l4.5 4.5M8.5 11h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    list: '<path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    star: '<path d="M12 3.8l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="none"/>',
    star_fill: '<path d="M12 3.8l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" fill="currentColor" stroke="none"/>',
    share: '<path d="M12 3v11M8 7l4-4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M5 11v8h14v-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>'
  };

  window.DD = window.DD || {};
  DD.icon = function (name, size) {
    const p = ICONS[name] ? ICONS[name] : ICONS.info;
    const s = size ? 'width:' + size + 'px;height:' + size + 'px;' : '';
    return '<svg class="ms" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="' + s + '" aria-hidden="true">' + p + '</svg>';
  };
})();
