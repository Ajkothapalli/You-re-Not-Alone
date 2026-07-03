import { ActivityIndicator, View } from 'react-native';
import { color } from '@/theme/tokens';

// Exists only to prevent Expo Router from showing "Unmatched Route" when the
// OAuth PKCE callback (soulyap://auth?code=...) arrives as a deep link.
// The actual code exchange is handled by Linking.addEventListener in index.tsx.
export default function AuthCallbackScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: color.bg, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator color="#FBBF24" />
    </View>
  );
}
