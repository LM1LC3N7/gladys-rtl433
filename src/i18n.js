// -----------------------------------------------------------------------------
// Texts shown in Gladys (connection status, buttons), in English and French.
// -----------------------------------------------------------------------------

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const both = (en, fr) => ({ en, fr });

/** "40 s", "5 min", "3 h", "2 d" (the same in both languages, but "j" for days in French). */
export function ago(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) {
    return both(`${s} s`, `${s} s`);
  }
  if (s < 3600) {
    const m = Math.round(s / 60);
    return both(`${m} min`, `${m} min`);
  }
  if (s < 86_400) {
    const h = Math.round(s / 3600);
    return both(`${h} h`, `${h} h`);
  }
  const d = Math.round(s / 86_400);
  return both(`${d} d`, `${d} j`);
}

// --- Values, for the "list the sensors heard" button ----------------------------

const UNITS = {
  temperature: ' °C',
  humidity: ' %',
  moisture: ' %',
  wind_speed: ' km/h',
  wind_gust: ' km/h',
  wind_direction: '°',
  rain: ' mm',
  rain_rate: ' mm/h',
  pressure: ' hPa',
  tire_pressure: ' bar',
  light: ' lx',
  uv: '',
  power: ' W',
  energy: ' kWh',
  current: ' A',
  voltage: ' V',
  battery: ' %',
};

const LABELS = {
  humidity: ['humidity ', 'humidité '],
  moisture: ['soil ', 'sol '],
  wind_speed: ['wind ', 'vent '],
  wind_gust: ['gust ', 'rafale '],
  wind_direction: ['direction ', 'direction '],
  rain: ['rain ', 'pluie '],
  rain_rate: ['rain ', 'pluie '],
  tire_pressure: ['tyre ', 'pneu '],
  uv: ['UV ', 'UV '],
  battery: ['battery ', 'batterie '],
};

const STATES = {
  opening: [
    ['closed', 'fermé'],
    ['open', 'ouvert'],
  ],
  motion: [
    ['no motion', 'pas de mouvement'],
    ['motion', 'mouvement'],
  ],
  leak: [
    ['dry', 'sec'],
    ['leak', 'fuite'],
  ],
  smoke: [
    ['no smoke', 'pas de fumée'],
    ['smoke', 'fumée'],
  ],
  tamper: [
    ['case closed', 'boîtier fermé'],
    ['tampered', 'boîtier ouvert'],
  ],
};

const BUTTON_ACTIONS = { 7: [' on', ' on'], 8: [' off', ' off'] };

/** One value, readable: "21.3 °C", "humidité 45 %", "ouvert", "bouton 2 on". */
export function describeValue(key, state) {
  if (key.startsWith('button_')) {
    const code = key.slice('button_'.length);
    const [en, fr] = BUTTON_ACTIONS[state] ?? ['', ''];
    return both(`button ${code}${en}`, `bouton ${code}${fr}`);
  }
  const probe = /^(.+)_(\d+)$/.exec(key);
  const base = probe && !UNITS[key] && !STATES[key] ? probe[1] : key;
  if (STATES[base]) {
    const [en, fr] = STATES[base][state ? 1 : 0];
    return both(en, fr);
  }
  const [labelEn, labelFr] = LABELS[base] ?? ['', ''];
  const tag = probe && base !== key ? `#${probe[2]} ` : '';
  const unit = UNITS[base] ?? '';
  return both(
    `${labelEn}${tag}${state}${unit}`,
    `${labelFr}${tag}${String(state).replace('.', ',')}${unit}`,
  );
}

/** Several values, joined. */
export function describeValues(entries) {
  const parts = entries.map(([key, state]) => describeValue(key, state));
  return both(parts.map((p) => p.en).join(', '), parts.map((p) => p.fr).join(', '));
}

const source = (kind) =>
  kind === 'http'
    ? both("rtl_433's HTTP server", 'le serveur HTTP de rtl_433')
    : both('the MQTT broker', 'le broker MQTT');

export const T = {
  notConfigured: both(
    "Type the address of your MQTT broker (for example mqtt://192.168.1.10:1883), or of rtl_433's HTTP server (http://192.168.1.20:8433), in the configuration.",
    "Saisissez l'adresse de votre broker MQTT (par exemple mqtt://192.168.1.10:1883), ou celle du serveur HTTP de rtl_433 (http://192.168.1.20:8433), dans la configuration.",
  ),
  badUrl: (reason) =>
    reason === 'credentials'
      ? both(
          'Put the user name and the password in their own fields, not in the address.',
          "Mettez l'utilisateur et le mot de passe dans leurs champs, pas dans l'adresse.",
        )
      : both(
          'The address is not valid: use mqtt://host:1883 or mqtts://host:8883 for a broker, http://host:8433 for rtl_433 itself.',
          "L'adresse n'est pas valide : utilisez mqtt://hôte:1883 ou mqtts://hôte:8883 pour un broker, http://hôte:8433 pour rtl_433 lui-même.",
        ),
  connecting: (kind) =>
    kind === 'http'
      ? both('Connecting to rtl_433…', 'Connexion à rtl_433…')
      : both('Connecting to the MQTT broker…', 'Connexion au broker MQTT…'),
  waiting: (kind, topic) =>
    kind === 'http'
      ? both(
          'Connected to rtl_433. Waiting for the first radio message…',
          'Connecté à rtl_433. En attente du premier message radio…',
        )
      : both(
          `Connected to the broker. Waiting for the first rtl_433 event on "${topic}"…`,
          `Connecté au broker. En attente du premier événement rtl_433 sur « ${topic} »…`,
        ),
  connected: (kind, heard, created) => {
    const where = kind === 'http' ? both('rtl_433', 'à rtl_433') : both('the broker', 'au broker');
    return both(
      `Connected to ${where.en}: ${plural(heard, 'sensor', 'sensors')} heard, ${created} in Gladys. Open Discovery to add yours ("List the sensors heard" helps to recognize them).`,
      `Connecté ${where.fr} : ${plural(heard, 'capteur entendu', 'capteurs entendus')}, ${created} dans Gladys. Ouvrez Découverte pour ajouter les vôtres (« Lister les capteurs entendus » aide à les reconnaître).`,
    );
  },
  offline: both(
    'Connected to the broker, but rtl_433 says it is offline (availability topic): check the rtl_433 container and its dongle.',
    "Connecté au broker, mais rtl_433 s'annonce hors ligne (topic availability) : vérifiez le conteneur rtl_433 et sa clé.",
  ),
  unreachable: (kind, message) => {
    const s = source(kind);
    return both(
      `${s.en[0].toUpperCase()}${s.en.slice(1)} is unreachable: ${message}. Retrying every few seconds.`,
      `${s.fr[0].toUpperCase()}${s.fr.slice(1)} est injoignable : ${message}. Nouvel essai toutes les quelques secondes.`,
    );
  },
  refused: (message) =>
    both(
      `The MQTT broker refused the connection: ${message}. Check the user name and the password.`,
      `Le broker MQTT a refusé la connexion : ${message}. Vérifiez l'utilisateur et le mot de passe.`,
    ),
  test: {
    ok: (name, seconds, heard) =>
      both(
        `Connection OK: rtl_433 is sending (${name} heard after ${seconds} s). ${plural(heard, 'sensor', 'sensors')} heard since the start.`,
        `Connexion OK : rtl_433 émet (${name} entendu après ${seconds} s). ${plural(heard, 'capteur entendu', 'capteurs entendus')} depuis le démarrage.`,
      ),
    silent: (kind, topic, seconds) =>
      kind === 'http'
        ? both(
            `Connected to rtl_433, but no radio message in ${seconds} s. Is a sensor in range? Check the frequency (-f) of rtl_433.`,
            `Connecté à rtl_433, mais aucun message radio en ${seconds} s. Un capteur est-il à portée ? Vérifiez la fréquence (-f) de rtl_433.`,
          )
        : both(
            `Connection OK, but no rtl_433 event on "${topic}" in ${seconds} s. Check that rtl_433 runs with -F mqtt://… pointing to this broker, and the topic.`,
            `Connexion OK, mais aucun événement rtl_433 sur « ${topic} » en ${seconds} s. Vérifiez que rtl_433 tourne avec -F mqtt://… vers ce broker, et le topic.`,
          ),
    offline: both(
      'Connection OK, but no event and rtl_433 says it is offline (availability topic): check the rtl_433 container and its dongle.',
      "Connexion OK, mais aucun événement et rtl_433 s'annonce hors ligne (topic availability) : vérifiez le conteneur rtl_433 et sa clé.",
    ),
  },
  list: {
    empty: both(
      'No sensor heard yet. Sensors transmit every 30 to 60 s: wait a minute, or press the button of a remote.',
      "Aucun capteur entendu pour l'instant. Les capteurs émettent toutes les 30 à 60 s : patientez une minute, ou appuyez sur une télécommande.",
    ),
    header: (heard, shown) =>
      both(
        `${plural(heard, 'sensor', 'sensors')} heard${heard > shown ? ` (the ${shown} heard last)` : ''}, most recent first:`,
        `${plural(heard, 'capteur entendu', 'capteurs entendus')}${heard > shown ? ` (les ${shown} derniers)` : ''}, du plus récent au plus ancien :`,
      ),
    line: ({ name, values, count, since, rssi, created }) =>
      both(
        `• ${name}: ${values.en || 'nothing supported yet'}. ${plural(count, 'message', 'messages')}, last ${since.en} ago${rssi === undefined ? '' : `, ${rssi} dB`}${created ? ', in Gladys' : ''}.`,
        `• ${name} : ${values.fr || 'rien de pris en charge pour l’instant'}. ${plural(count, 'message', 'messages')}, dernier il y a ${since.fr}${rssi === undefined ? '' : `, ${rssi} dB`}${created ? ', dans Gladys' : ''}.`,
      ),
    tpms: (count) =>
      both(
        `${plural(count, 'tyre pressure sensor (TPMS) was', 'tyre pressure sensors (TPMS) were')} left out (see the configuration).`,
        `${plural(count, 'capteur de pression de pneu (TPMS) ignoré', 'capteurs de pression de pneu (TPMS) ignorés')} (voir la configuration).`,
      ),
    hint: both(
      'The strongest signal (dB closest to 0) is usually the nearest sensor: yours.',
      'Le signal le plus fort (dB le plus proche de 0) est en général le capteur le plus proche : le vôtre.',
    ),
  },
  notConnected: both(
    'Not connected yet: check the configuration and the status above.',
    "Pas encore connecté : vérifiez la configuration et l'état ci-dessus.",
  ),
};
