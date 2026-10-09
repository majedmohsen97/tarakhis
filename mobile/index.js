// App entry. The background location task must be defined before the app starts, because the
// OS can launch the app in the background (no screens mounted) just to deliver a location update.
import './src/lib/backgroundLocation';
import 'expo-router/entry';
