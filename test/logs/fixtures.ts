export const LOGCAT_OUTPUT = `@@app br.com.client.hmlqa 10868
--------- beginning of main
10-21 09:06:17.026 10868 18336 E ReactNativeJS: [Error: Expected mounted root to have known pseudo key.]
10-21 09:06:23.446 10868 10868 I ImeFocusController: onPreWindowFocus: skipped hasWindowFocus=false mHasImeFocus=true
10-21 09:06:23.453 10868 11104 W qdgralloc: getInterlacedFlag: getMetaData returned 3, defaulting to interlaced_flag = 0
10-21 09:06:23.472 10868 10868 D InputMethodManagerUtils: startInputInner - Id : 0
--------- beginning of system
10-21 09:06:23.502 10868 10868 D InsetsController: hide(ime())
10-21 09:06:24.100 10868 18336 E AndroidRuntime: FATAL EXCEPTION: main
10-21 09:06:24.100 10868 18336 E AndroidRuntime: java.lang.IllegalStateException: boom
10-21 09:06:24.100 10868 18336 E AndroidRuntime: \tat com.example.Main.run(Main.java:12)
10-21 09:06:24.200 10868 18336 I ReactNativeJS: 'trip accepted', { id: 42 }
`;
