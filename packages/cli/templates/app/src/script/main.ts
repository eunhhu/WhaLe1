// Frida script — runs inside the target process
// __whale_store__ is synced with the UI store defined in src/store/
//
// Quick start:
//   1. Add cheat values to your store (src/store/app.ts)
//   2. Read them here: __whale_store__.count
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
