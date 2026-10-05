import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  APP_ID,
  APP_LINK_HOST,
  focusedWindowFlags,
  isInside,
  parseAppLinks,
  parseInstaller,
  parseVersion,
  renderSection,
} from './android-evidence.ts';

const APP_LINKS_VERIFIED = `  in.sanchay.app:
    ID: 6a1e3c0e-2f7d-4b8e-9d55-0c4a1b2c3d4e
    Signatures: [AA:BB:CC:DD]
    Domain verification state:
      app.sanchay.in: verified
`;

const APP_LINKS_PENDING = `  in.sanchay.app:
    ID: 6a1e3c0e-2f7d-4b8e-9d55-0c4a1b2c3d4e
    Signatures: [AA:BB:CC:DD]
    Domain verification state:
      app.sanchay.in: 1024
`;

const DUMPSYS_SECURE = `WINDOW MANAGER WINDOWS (dumpsys window windows)
  Window #4 Window{77aa11 u0 com.android.systemui/StatusBar}:
    mAttrs={(0,0)(fillx66) ty=STATUS_BAR
      fl=NOT_FOCUSABLE SECURE
  Window #5 Window{1a2b3c4 u0 in.sanchay.app/in.sanchay.app.MainActivity}:
    mDisplayId=0 rootTaskId=12
    mAttrs={(0,0)(fillxfill) sim={adjust=resize} ty=BASE_APPLICATION fmt=TRANSLUCENT
      fl=LAYOUT_IN_SCREEN LAYOUT_INSET_DECOR SECURE SPLIT_TOUCH HARDWARE_ACCELERATED
      pfl=FORCE_DRAW_STATUS_BAR_BACKGROUND
  mCurrentFocus=Window{1a2b3c4 u0 in.sanchay.app/in.sanchay.app.MainActivity}
`;

const DUMPSYS_NOT_SECURE = DUMPSYS_SECURE.replace(
  'fl=LAYOUT_IN_SCREEN LAYOUT_INSET_DECOR SECURE SPLIT_TOUCH',
  'fl=LAYOUT_IN_SCREEN LAYOUT_INSET_DECOR SPLIT_TOUCH',
);

describe('constants', () => {
  it('pins the Android application id and the App Links host (G-E6)', () => {
    assert.equal(APP_ID, 'in.sanchay.app');
    assert.equal(APP_LINK_HOST, 'app.sanchay.in');
  });
});

describe('parseAppLinks', () => {
  it('reads each domain and its verification state', () => {
    assert.deepEqual(parseAppLinks(APP_LINKS_VERIFIED), { 'app.sanchay.in': 'verified' });
    assert.deepEqual(parseAppLinks(APP_LINKS_PENDING), { 'app.sanchay.in': '1024' });
  });

  it('returns nothing when the package is unknown', () => {
    assert.deepEqual(parseAppLinks(''), {});
  });
});

describe('parseInstaller', () => {
  it('reads the installer of the package (Play internal testing installs via com.android.vending)', () => {
    assert.equal(
      parseInstaller('package:in.sanchay.app  installer=com.android.vending\n'),
      'com.android.vending',
    );
    assert.equal(parseInstaller('package:in.sanchay.app  installer=null\n'), 'null');
    assert.equal(parseInstaller(''), null);
  });
});

describe('parseVersion', () => {
  it('reads versionName and versionCode from dumpsys package', () => {
    const out = '    versionCode=7 minSdk=24 targetSdk=35\n    versionName=0.1.0\n';
    assert.deepEqual(parseVersion(out), { versionName: '0.1.0', versionCode: '7' });
  });
});

describe('focusedWindowFlags', () => {
  it('returns the fl= flags of the focused Sanchay window, ignoring other windows and pfl=', () => {
    const r = focusedWindowFlags(DUMPSYS_SECURE);
    assert.equal(r.component, 'in.sanchay.app/in.sanchay.app.MainActivity');
    assert.ok(r.flags.includes('SECURE'));
    assert.ok(!r.flags.includes('FORCE_DRAW_STATUS_BAR_BACKGROUND'));
  });

  it('does not borrow SECURE from another window', () => {
    const r = focusedWindowFlags(DUMPSYS_NOT_SECURE);
    assert.equal(r.component, 'in.sanchay.app/in.sanchay.app.MainActivity');
    assert.ok(!r.flags.includes('SECURE'));
  });

  it('reports no component when nothing has focus', () => {
    assert.deepEqual(focusedWindowFlags('WINDOW MANAGER WINDOWS\n'), {
      component: null,
      flags: [],
    });
  });
});

describe('isInside', () => {
  it('refuses a screenshot directory inside the repository (screens can show real investor data)', () => {
    assert.equal(isInside('C:/repo/docs/probes/g-e6', 'C:/repo'), true);
    assert.equal(isInside('C:/repo', 'C:/repo'), true);
    assert.equal(isInside('C:/evidence/g-e6', 'C:/repo'), false);
    assert.equal(isInside('C:/repo-evidence', 'C:/repo'), false);
  });
});

describe('renderSection', () => {
  it('renders a PASS or FAIL heading, the command and its raw output', () => {
    const md = renderSection({
      title: 'App Links',
      pass: true,
      command: 'adb shell pm get-app-links in.sanchay.app',
      output: APP_LINKS_VERIFIED,
      at: '2026-11-23T10:15:00+05:30',
      notes: ['app.sanchay.in: verified'],
    });
    assert.match(md, /^## App Links: PASS \(2026-11-23T10:15:00\+05:30\)$/m);
    assert.match(md, /^- app\.sanchay\.in: verified$/m);
    assert.match(md, /adb shell pm get-app-links in\.sanchay\.app/);
    assert.match(md, /Domain verification state:/);
  });
});
