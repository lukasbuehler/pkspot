/// <reference types="@angular/localize" />

// Vite serves some partially compiled Angular dependencies in development.
// Load the compiler before importing the application so its JIT fallback is
// available for those dependencies. Production uses `main.ts` and stays AOT.
import "@angular/compiler";

void import("./main.bootstrap").then(({ bootstrap }) => bootstrap());
