// Polyfills for Node.js built-in modules in browser environment
// This is needed for xml2js and other packages that depend on Node.js modules
import { Buffer } from "buffer";

// Make Buffer available globally
(window as any).global = window;
(window as any).Buffer = Buffer;

if (!(window as any).require) {
  (window as any).require = (id: string) => {
    if (id === "events") {
      // Simple EventEmitter polyfill
      class EventEmitter {
        private events: { [key: string]: Function[] } = {};

        on(event: string, listener: Function) {
          if (!this.events[event]) {
            this.events[event] = [];
          }
          this.events[event].push(listener);
          return this;
        }

        emit(event: string, ...args: any[]) {
          if (this.events[event]) {
            this.events[event].forEach((listener) => listener(...args));
          }
          return this.events[event]?.length > 0;
        }

        removeListener(event: string, listener: Function) {
          if (this.events[event]) {
            const index = this.events[event].indexOf(listener);
            if (index > -1) {
              this.events[event].splice(index, 1);
            }
          }
          return this;
        }

        removeAllListeners(event?: string) {
          if (event) {
            delete this.events[event];
          } else {
            this.events = {};
          }
          return this;
        }
      }

      return { EventEmitter };
    }

    if (id === "string_decoder") {
      // Simple StringDecoder polyfill
      class StringDecoder {
        private encoding: string;

        constructor(encoding = "utf8") {
          this.encoding = encoding;
        }

        write(buffer: any): string {
          if (typeof buffer === "string") return buffer;
          if (buffer && buffer.toString) {
            return buffer.toString(this.encoding);
          }
          return String(buffer);
        }

        end(buffer?: any): string {
          return buffer ? this.write(buffer) : "";
        }
      }

      return { StringDecoder };
    }

    if (id === "buffer") {
      // Use the buffer polyfill package we installed
      return require("buffer");
    }

    // Default empty object for unknown modules
    return {};
  };
}
