export interface Subscriber {
  topic: string;
  icon: string;
}

export function setupSubscribers(
  bus: { subscribe<T>(topic: string, listener: (payload: T, topic: string) => void): () => void },
  subs: Subscriber[],
  onMatch: (topic: string) => void,
) {
  const defs: Subscriber[] = [
    { topic: 'system/+', icon: '🖥' },
    { topic: 'system/cpu', icon: '🔥' },
    { topic: 'system/memory', icon: '🧠' },
    { topic: 'sensors/+/temp', icon: '🌡' },
    { topic: 'sensors/#', icon: '📡' },
    { topic: 'logs/error/#', icon: '🚨' },
    { topic: 'logs/#', icon: '📋' },
    { topic: '#', icon: '🌐' },
  ];

  for (const def of defs) {
    subs.push(def);
    bus.subscribe(def.topic, (_payload: unknown, topic: string) => {
      onMatch(def.topic);

      // Update the card's last-received display
      const card = document.querySelector(
        `.subscriber-card[data-topic="${def.topic.replace(/"/g, '&quot;')}"]`
      );
      if (card) {
        const lastEl = card.querySelector('.card-last');
        if (lastEl) {
          const display =
            typeof _payload === 'string'
              ? _payload
              : JSON.stringify(_payload);
          lastEl.innerHTML = `<span class="val">${display}</span> ← <span class="src">${topic}</span>`;
        }
      }
    });
  }

  return defs;
}
