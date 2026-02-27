
import { Platform } from 'react-native';
import { Stack } from 'expo-router';

export default function HomeLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: false, // Hide Stack header to match other pages (Logbook, Profile)
          title: 'Home'
        }}
      />
    </Stack>
  );
}
