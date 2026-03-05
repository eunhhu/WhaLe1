// Frida script — runs inside the target process
// When whale.config.ts sets `store: 'app'`, __app__ is synced with src/store/app.ts.
//
// Quick start:
//   1. Add cheat values to your store (src/store/app.ts)
//   2. Read them here: __app__.count
//   3. Use Frida APIs to patch the target process
//
// Example:
//   const target = Module.findExportByName(null, 'game_tick')
//   if (target) {
//     Interceptor.attach(target, {
//       onEnter(_args: InvocationArguments) {
//         // Your patches here
//       },
//     })
//   }
