import * as Location from "expo-location";
import { t } from "./i18n";

export type LatLng = { lat: number; lng: number };

export async function getHere(): Promise<LatLng | null> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) return null;
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function travelLabel(km: number): string {
  const dist = km < 10 ? km.toFixed(1) : Math.round(km).toString();
  if (km <= 1) return `${dist} km · ${t.location.walk(Math.max(1, Math.round(km * 13)))}`;
  return `${dist} km · ${t.location.drive(Math.round(3 + km * 1.8))}`;
}
