// Angular ships partial-Ivy compiled output; some of its own internal DI
// tokens (e.g. PlatformLocation, pulled in transitively by
// @angular/common/http) fall back to JIT compilation outside a real ng
// build/Angular Linker step. Loading the compiler here satisfies that.
import '@angular/compiler';
