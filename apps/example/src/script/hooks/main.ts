const gameTick = Module.getGlobalExportByName('game_tick')

Interceptor.attach(gameTick, {
  onEnter(_args: InvocationArguments) {
    if (__whale_store__.godMode) {
      // Example: patch health to max
    }
    if (__whale_store__.speedHack !== 1.0) {
      // Example: modify game speed
    }
  },
})
