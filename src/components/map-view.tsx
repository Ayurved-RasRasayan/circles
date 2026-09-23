'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-providers'

export interface MapMember {
  userId: string
  username: string
  displayName: string
  avatarColor: string
  lat: number
  lng: number
  accuracy?: number
  heading?: number
  timestamp: number
  isMe?: boolean
}

interface MapViewProps {
  members: MapMember[]
  followUserId?: string | null
  onRecenter?: (cb: () => void) => void
  onFlyToUser?: (cb: (userId: string) => void) => void
}

// Create a circular avatar marker
function createAvatarIcon(color: string, label: string, isMe: boolean) {
  const size = isMe ? 48 : 40
  const ring = isMe ? '#0ea5e9' : '#ffffff'
  const html = `
    <div style="position: relative; width: ${size}px; height: ${size}px;">
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: ${color};
        border: 3px solid ${ring};
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 700;
        font-size: ${isMe ? 18 : 16}px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      ">${label}</div>
      ${isMe ? `<div style="
        position: absolute;
        bottom: -4px;
        left: 50%;
        transform: translateX(-50%);
        background: #0ea5e9;
        color: white;
        font-size: 9px;
        padding: 1px 6px;
        border-radius: 8px;
        font-weight: 600;
        white-space: nowrap;
      ">YOU</div>` : ''}
    </div>
  `
  return L.divIcon({
    html,
    className: 'avatar-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

export default function MapView({ members, followUserId, onRecenter, onFlyToUser }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const accuracyRef = useRef<Map<string, L.Circle>>(new Map())

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [20, 0],
      zoom: 2,
      zoomControl: true,
      attributionControl: true,
    })

    // Multiple base layers with a switcher
    const streetsLayer = L.tileLayer.provider('OpenStreetMap.Mapnik')
    const satelliteLayer = L.tileLayer.provider('Esri.WorldImagery')
    const terrainLayer = L.tileLayer.provider('OpenTopoMap')

    streetsLayer.addTo(map)

    L.control.layers({
      'Streets': streetsLayer,
      'Satellite': satelliteLayer,
      'Terrain': terrainLayer,
    }, {}, { position: 'topright', collapsed: true }).addTo(map)

    // Add locate control
    L.control.locate = function () {} as any

    mapRef.current = map

    // Fix sizing after mount
    setTimeout(() => map.invalidateSize(), 100)

    return () => {
      map.remove()
      mapRef.current = null
      markersRef.current.clear()
      accuracyRef.current.clear()
    }
  }, [])

  // Expose recenter function
  useEffect(() => {
    if (onRecenter) {
      onRecenter(() => {
        const map = mapRef.current
        if (!map) return
        if (followUserId) {
          const m = members.find((m) => m.userId === followUserId)
          if (m) {
            map.setView([m.lat, m.lng], 16, { animate: true })
          }
        } else {
          // Fit all members
          const valid = members.filter((m) => !isNaN(m.lat) && !isNaN(m.lng))
          if (valid.length === 1) {
            map.setView([valid[0].lat, valid[0].lng], 16, { animate: true })
          } else if (valid.length > 1) {
            const bounds = L.latLngBounds(valid.map((m) => [m.lat, m.lng] as [number, number]))
            map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 })
          }
        }
      })
    }
  }, [members, followUserId, onRecenter])

  // Expose flyToUser function  fly to a specific user's location
  useEffect(() => {
    if (onFlyToUser) {
      onFlyToUser((userId: string) => {
        const map = mapRef.current
        if (!map) return
        const m = members.find((mm) => mm.userId === userId)
        if (m && !isNaN(m.lat) && !isNaN(m.lng)) {
          map.flyTo([m.lat, m.lng], 17, { animate: true, duration: 0.8 })
        }
      })
    }
  }, [members, onFlyToUser])

  // Update markers when members change
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const currentIds = new Set(members.map((m) => m.userId))

    // Remove stale markers
    for (const [id, marker] of markersRef.current.entries()) {
      if (!currentIds.has(id)) {
        marker.remove()
        markersRef.current.delete(id)
      }
    }
    for (const [id, circle] of accuracyRef.current.entries()) {
      if (!currentIds.has(id)) {
        circle.remove()
        accuracyRef.current.delete(id)
      }
    }

    // Add or update markers
    for (const m of members) {
      if (isNaN(m.lat) || isNaN(m.lng)) continue
      const initial = (m.displayName || m.username || '?').charAt(0).toUpperCase()
      const icon = createAvatarIcon(m.avatarColor, initial, !!m.isMe)

      let marker = markersRef.current.get(m.userId)
      if (!marker) {
        marker = L.marker([m.lat, m.lng], { icon }).addTo(map)
        marker.bindPopup(`
          <div style="font-family: sans-serif; min-width: 140px;">
            <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px;">${m.displayName}</div>
            <div style="color: #6b7280; font-size: 12px;">@${m.username}</div>
            <div style="color: #6b7280; font-size: 11px; margin-top: 4px;">
              Updated ${timeAgo(m.timestamp)}
            </div>
          </div>
        `)
        markersRef.current.set(m.userId, marker)
      } else {
        marker.setLatLng([m.lat, m.lng])
        marker.setIcon(icon)
        marker.setPopupContent(`
          <div style="font-family: sans-serif; min-width: 140px;">
            <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px;">${m.displayName}</div>
            <div style="color: #6b7280; font-size: 12px;">@${m.username}</div>
            <div style="color: #6b7280; font-size: 11px; margin-top: 4px;">
              Updated ${timeAgo(m.timestamp)}
            </div>
          </div>
        `)
      }

      // Accuracy circle
      if (m.accuracy && m.accuracy > 0 && m.accuracy < 5000) {
        let circle = accuracyRef.current.get(m.userId)
        if (!circle) {
          circle = L.circle([m.lat, m.lng], {
            radius: m.accuracy,
            color: m.avatarColor,
            fillColor: m.avatarColor,
            fillOpacity: 0.1,
            weight: 1,
            opacity: 0.5,
          }).addTo(map)
          accuracyRef.current.set(m.userId, circle)
        } else {
          circle.setLatLng([m.lat, m.lng])
          circle.setRadius(m.accuracy)
        }
      } else {
        const circle = accuracyRef.current.get(m.userId)
        if (circle) {
          circle.remove()
          accuracyRef.current.delete(m.userId)
        }
      }
    }

    // Auto-follow if requested
    if (followUserId) {
      const target = members.find((m) => m.userId === followUserId)
      if (target && !isNaN(target.lat) && !isNaN(target.lng)) {
        map.panTo([target.lat, target.lng], { animate: true })
      }
    }
  }, [members, followUserId])

  return <div ref={containerRef} className="w-full h-full" />
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts
  if (diff < 5000) return 'just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return `${Math.floor(diff / 3600000)}h ago`
}