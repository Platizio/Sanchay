declare module 'react-native-web' {
  // react-native-web@0.21.2 ships no types; getSheet() is its documented SSR API.
  export const StyleSheet: { getSheet(): { id: string; textContent: string } };
}
