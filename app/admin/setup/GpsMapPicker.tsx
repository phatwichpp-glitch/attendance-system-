"use client";

import { FormEvent, useEffect, useState } from "react";
import { Circle, CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";

interface GpsMapPickerProps {
  lat: number;
  lng: number;
  radiusM: number;
  disabled?: boolean;
  onUseCurrentLocation?: () => void;
  onPick: (coords: { lat: number; lng: number }) => void;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

interface ReverseResult {
  display_name?: string;
}

function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [lat, lng, map]);

  return null;
}

function PickHandler({ disabled, onPick }: { disabled?: boolean; onPick: (coords: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(e) {
      if (disabled) return;
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });

  return null;
}

export default function GpsMapPicker({ lat, lng, radiusM, disabled, onUseCurrentLocation, onPick }: GpsMapPickerProps) {
  const hasValidCoords = lat !== 0 || lng !== 0;
  const center = hasValidCoords ? { lat, lng } : { lat: 13.7563, lng: 100.5018 };
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [resolvedAddress, setResolvedAddress] = useState("");
  const [addressLoading, setAddressLoading] = useState(false);

  useEffect(() => {
    if (!hasValidCoords) {
      setResolvedAddress("");
      return;
    }

    const controller = new AbortController();

    const resolveAddress = async () => {
      try {
        setAddressLoading(true);
        const params = new URLSearchParams({
          format: "jsonv2",
          lat: String(center.lat),
          lon: String(center.lng),
          "accept-language": "th,en",
        });
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Reverse geocode failed");
        const data = (await res.json()) as ReverseResult;
        setResolvedAddress(data.display_name ?? "");
      } catch {
        if (!controller.signal.aborted) setResolvedAddress("");
      } finally {
        if (!controller.signal.aborted) setAddressLoading(false);
      }
    };

    resolveAddress();

    return () => {
      controller.abort();
    };
  }, [center.lat, center.lng, hasValidCoords]);

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const keyword = query.trim();
    if (!keyword) {
      setResults([]);
      setSearchError("");
      return;
    }

    try {
      setSearching(true);
      setSearchError("");
      const params = new URLSearchParams({
        format: "jsonv2",
        q: keyword,
        limit: "5",
        countrycodes: "th",
        "accept-language": "th,en",
      });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
      if (!res.ok) throw new Error("Search failed");
      const data = (await res.json()) as NominatimResult[];
      setResults(data);
      if (data.length === 0) setSearchError("No places found");
    } catch {
      setSearchError("Search unavailable. Try clicking map directly.");
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-2">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          className="input text-[12px]"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search building/place in Thailand"
          disabled={disabled || searching}
        />
        <button type="submit" className="btn-outline text-[12px] px-3" disabled={disabled || searching}>
          {searching ? "Searching..." : "Search"}
        </button>
      </form>

      {onUseCurrentLocation && (
        <button
          type="button"
          className="btn-outline text-[12px] px-3"
          onClick={onUseCurrentLocation}
          disabled={disabled || searching}
        >
          Use Current Location
        </button>
      )}

      {searchError && (
        <p className="text-[11px]" style={{ color: "#854F0B" }}>{searchError}</p>
      )}

      {results.length > 0 && (
        <div className="rounded-lg" style={{ border: "0.5px solid rgba(0,0,0,0.08)", maxHeight: 140, overflowY: "auto" }}>
          {results.map((r, idx) => (
            <button
              key={`${r.lat}-${r.lon}-${idx}`}
              type="button"
              className="w-full text-left px-3 py-2 text-[11px] hover:bg-gray-50"
              style={{ borderTop: idx === 0 ? "none" : "0.5px solid rgba(0,0,0,0.06)" }}
              onClick={() => {
                setResults([]);
                setResolvedAddress(r.display_name);
                onPick({ lat: parseFloat(r.lat), lng: parseFloat(r.lon) });
              }}
            >
              {r.display_name}
            </button>
          ))}
        </div>
      )}

      <MapContainer
        center={[center.lat, center.lng]}
        zoom={hasValidCoords ? 18 : 13}
        scrollWheelZoom
        className="h-64 w-full rounded-lg"
        style={{ border: "0.5px solid rgba(0,0,0,0.1)", zIndex: 0 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <RecenterMap lat={center.lat} lng={center.lng} />
        <PickHandler disabled={disabled} onPick={onPick} />

        <CircleMarker
          center={[center.lat, center.lng]}
          radius={7}
          pathOptions={{ color: "#185FA5", fillColor: "#185FA5", fillOpacity: 0.9, weight: 2 }}
        />
        <Circle
          center={[center.lat, center.lng]}
          radius={Math.max(10, radiusM)}
          pathOptions={{ color: "#185FA5", fillColor: "#185FA5", fillOpacity: 0.12, weight: 1.5 }}
        />
      </MapContainer>

      <p className="text-[11px] text-gray-500">
        Search in Thailand, use current location, or click directly on map to set classroom point.
      </p>

      {hasValidCoords && (
        <div className="rounded-lg px-3 py-2 text-[11px]" style={{ backgroundColor: "#f9fafb", border: "0.5px solid rgba(0,0,0,0.08)" }}>
          <p className="font-medium text-gray-700 mb-1">Selected Address</p>
          {addressLoading ? (
            <p className="text-gray-500">Resolving address...</p>
          ) : resolvedAddress ? (
            <p className="text-gray-600">{resolvedAddress}</p>
          ) : (
            <p className="text-gray-500">Address unavailable for this point.</p>
          )}
        </div>
      )}
    </div>
  );
}
