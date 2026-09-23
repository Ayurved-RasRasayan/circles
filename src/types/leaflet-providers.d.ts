// Type declaration for leaflet-providers plugin
// Allows L.tileLayer.provider(name, options) in TypeScript
import * as L from 'leaflet'

declare module 'leaflet' {
  namespace tileLayer {
    function provider(name: string, options?: any): L.TileLayer
    namespace provider {
      const providers: Record<string, any>
    }
  }
}