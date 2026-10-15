# rtl_433 (433/868 MHz)

[rtl_433](https://github.com/merbanan/rtl_433) transforme une **clé SDR à
25 €** (puce RTL2832U) en récepteur radio pour des centaines d'appareils
433 MHz et 868 MHz : stations météo, thermomètres et hygromètres, sondes de
sol, compteurs d'énergie (OWL), contacts de porte, détecteurs de mouvement et
de fumée, télécommandes, capteurs de pression des pneus… Cette intégration lit
ce que rtl_433 entend et propose chaque capteur dans l'onglet **Découverte**
de Gladys. Sans lien avec le projet rtl_433.

> **Version de développement (0.1).** Testée contre le vrai rtl_433 (25.12)
> rejouant des enregistrements radio de sa suite de tests, avec un vrai broker
> Mosquitto, mais pas encore avec une vraie clé SDR. Vos retours sont les
> bienvenus sur le dépôt GitHub.

## Principe

La clé SDR **ne se branche pas sur Gladys** : les intégrations n'ont pas accès
à l'USB. rtl_433 tourne **à côté de la clé**, dans son propre conteneur Docker
(sur la machine Gladys ou sur un Raspberry Pi mieux placé dans la maison), et
publie ce qu'il entend sur votre **broker MQTT**. L'intégration lit ce broker.

```
capteurs radio ))) clé SDR -> rtl_433 -> broker MQTT -> intégration -> Gladys
```

Sans broker, l'intégration peut aussi lire directement le serveur HTTP de
rtl_433 (voir plus bas).

## Ce que vous obtenez

| Champ rtl_433                                    | Dans Gladys                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `temperature_C`, `temperature_F`                 | température (convertie en °C)                                    |
| `temperature_1_C`, `temperature_2_C`…            | une température par sonde (thermomètres de cuisson, piscine…)    |
| `humidity`                                       | humidité (%)                                                     |
| `battery_ok`                                     | batterie (%) : 100 % = OK, 0 % = faible pour les capteurs OK/LOW |
| `wind_avg_*`, `wind_max_*`, `wind_dir_deg`       | vent moyen et rafales (km/h), direction (°)                      |
| `rain_mm`, `rain_in`, `rain_rate_*`              | pluie cumulée (mm) et intensité (mm/h)                           |
| `pressure_hPa`                                   | pression atmosphérique (hPa)                                     |
| `light_lux`, `uvi`                               | luminosité (lux), indice UV                                      |
| `power_W`, `energy_kWh`, `current`               | puissance (W), index d'énergie (kWh, OWL CM180/CM160), courant   |
| `moisture`                                       | humidité du sol (%)                                              |
| `state` open/closed, `contact_open`, `opened`    | ouverture (porte, fenêtre)                                       |
| `motion`                                         | mouvement                                                        |
| `detect_wet`, `water`                            | fuite d'eau                                                      |
| `tamper`                                         | sabotage (boîtier ouvert)                                        |
| détecteurs de fumée (Smoke-GS558…)               | fumée                                                            |
| `button`, `cmd`, `code`, `state` ON/OFF + `unit` | un bouton par touche, et le déclencheur de scène                 |
| `pressure_kPa`, `pressure_PSI` d'un capteur TPMS | pression du pneu (bar), sur option                               |

Un capteur = un modèle + un identifiant (+ un canal). Une station qui envoie
plusieurs types de messages (vent, puis pluie) forme un seul appareil, qui
réunit tout ce qu'elle mesure.

## 1. Le matériel

- Une clé **RTL-SDR** (RTL2832U + R820T2/R860), par exemple RTL-SDR Blog V3 ou
  V4, Nooelec NESDR : environ 25 €. L'antenne fournie suffit souvent ; une
  antenne 433 MHz (17 cm) placée en hauteur porte plus loin.
- Sous Linux, empêchez le pilote TNT de s'emparer de la clé, puis
  rebranchez-la :

```bash
echo 'blacklist dvb_usb_rtl28xxu' | sudo tee /etc/modprobe.d/blacklist-rtl.conf
```

## 2. Lancer rtl_433

Avec l'image Docker [hertzg/rtl_433](https://hub.docker.com/r/hertzg/rtl_433)
(amd64, arm64, armv7 : PC, NAS, Raspberry Pi), sur la machine où la clé est
branchée. Remplacez l'adresse du broker, l'utilisateur et le mot de passe :

```bash
docker run -d --name rtl_433 --restart unless-stopped \
  --device /dev/bus/usb \
  hertzg/rtl_433:latest \
  -M level \
  -F "mqtt://192.168.1.10:1883,user=UTILISATEUR,pass=MOTDEPASSE,retain=0,events=rtl_433[/model][/id]"
```

Ou avec Docker Compose :

```yaml
services:
  rtl_433:
    image: hertzg/rtl_433:latest
    container_name: rtl_433
    restart: unless-stopped
    devices:
      - /dev/bus/usb
    command:
      - -M
      - level
      - -F
      - mqtt://192.168.1.10:1883,user=UTILISATEUR,pass=MOTDEPASSE,retain=0,events=rtl_433[/model][/id]
```

- Le broker peut être celui de l'intégration MQTT de Gladys (port 1883,
  l'utilisateur et le mot de passe de sa configuration) ou le vôtre
  (Mosquitto…). Sans utilisateur, retirez `user=…,pass=…`.
- `-M level` ajoute la force du signal de chaque message : elle aide à
  reconnaître vos capteurs (voir plus bas).
- **868 MHz** (certaines stations Bresser, Fine Offset, capteurs européens) :
  ajoutez `-f 868.3M -s 1024k`. Pour écouter les deux bandes, le plus simple
  est une clé par bande (deux conteneurs, chacun avec `-d :<numéro de série>`) ;
  une seule clé peut alterner avec `-f 433.92M -f 868.3M -H 60`, au prix des
  messages émis pendant qu'elle écoute l'autre bande.
- Vérifiez que rtl_433 entend quelque chose : `docker logs -f rtl_433`.

## 3. Configurer l'intégration

1. **Adresse du broker MQTT** : vue depuis la machine Gladys, son adresse IP
   sur le réseau local, pas `localhost` (l'intégration tourne dans son propre
   conteneur). Exemples : `mqtt://192.168.1.10:1883`, `mqtts://broker.lan:8883`.
2. **Utilisateur** et **mot de passe** du broker, s'il en demande.
3. **Topic MQTT de rtl_433** : gardez `rtl_433/#`, qui couvre la commande
   ci-dessus comme les topics par défaut de rtl_433 (`rtl_433/<hôte>/events`).
4. Cliquez sur **Tester la connexion** : l'intégration attend le premier
   message de rtl_433 (jusqu'à 20 s) et indique le capteur entendu.

## 4. Ajouter VOS capteurs

Ouvrez l'onglet **Découverte** : chaque capteur entendu y apparaît, nommé
d'après son modèle, son identifiant et son canal (`Nexus-TH 201 ch3`). La liste
s'enrichit au fil des minutes (les capteurs émettent toutes les 30 à 60 s ; une
télécommande, quand on appuie dessus).

**Les capteurs des voisins sont entendus aussi.** Pour reconnaître les vôtres,
cliquez sur **Lister les capteurs entendus** dans la configuration : les
derniers capteurs entendus s'affichent avec leurs valeurs, le nombre de
messages et la force du signal. Le signal le plus fort (dB le plus proche de 0)
est en général le capteur le plus proche. Astuce : réchauffez une sonde dans
votre main, ou appuyez sur la télécommande, puis relancez la liste.

N'ajoutez que vos capteurs : les autres ne coûtent rien (rien n'est envoyé à
Gladys pour un appareil non ajouté) et quittent la liste après 24 h de silence.

**Capteurs de pression des pneus (TPMS)** : chaque voiture qui passe est
entendue, ils sont donc ignorés par défaut. Activez l'option pour suivre les
pneus de votre voiture (ils émettent en roulant, par exemple en rentrant au
garage).

**Changement de piles** : beaucoup de capteurs bon marché tirent un nouvel
identifiant à chaque changement de piles. Le capteur réapparaît alors comme un
nouvel appareil dans la Découverte : ajoutez-le et supprimez l'ancien.

## Scènes

- Les **télécommandes** ont un bouton par touche (« Button 1 », « Button 192 »…),
  utilisable dans le déclencheur « Changement d'état d'un appareil » : appui
  (clic), ou marche/arrêt pour les télécommandes ON/OFF (Nexa, KlikAanKlikUit,
  Waveman…). Chaque appui est envoyé, même deux fois de suite le même ; les
  répétitions de la trame radio d'un même appui (1,5 s) ne comptent qu'une fois.
- Le déclencheur **Télécommande ou bouton 433 MHz** reçoit chaque appui d'une
  télécommande ajoutée, filtrable par télécommande, par code (`1`, `192`…) et
  par action (appui, marche, arrêt), avec le modèle et le message reçu en
  variables.
- Les détecteurs de **mouvement** et de **fumée** n'envoient que « détecté » :
  ils repassent à 0 tout seuls 60 s après le dernier message.
- Les contacts de porte envoient ouvert **et** fermé : leur état suit la porte.

## Options

| Option                          | Par défaut  | Rôle                                                                                  |
| ------------------------------- | ----------- | ------------------------------------------------------------------------------------- |
| Topic MQTT de rtl_433           | `rtl_433/#` | à changer seulement si rtl_433 publie ailleurs                                        |
| Vérifier le certificat TLS      | oui         | à désactiver pour un broker au certificat auto-signé de votre réseau                  |
| Proposer les capteurs TPMS      | non         | voir plus haut                                                                        |
| Intervalle minimum d'un capteur | 30 s        | un compteur qui émet toutes les 6 s n'est enregistré qu'à ce rythme (dernière valeur) |

Les ouvertures, mouvements, alarmes et télécommandes ne sont jamais retardés.
Gladys accepte 300 états par minute et par intégration : l'intégration ne
renvoie que les valeurs qui changent, et répartit le reste.

## Sans broker MQTT : le serveur HTTP de rtl_433

rtl_433 peut servir lui-même ses messages en HTTP. Lancez-le avec :

```bash
docker run -d --name rtl_433 --restart unless-stopped \
  --device /dev/bus/usb -p 8433:8433 \
  hertzg/rtl_433:latest -M level -F http:0.0.0.0:8433
```

et saisissez `http://<adresse IP de cette machine>:8433` comme adresse dans la
configuration. Les champs utilisateur, mot de passe et topic ne servent pas.

## Fonctionnement

- Les messages lus sont les objets JSON qui ont un `model` (le format
  `events` de rtl_433) ; les topics `devices` (une valeur par topic) et
  `states` sont ignorés. L'état `availability` de rtl_433 s'affiche dans le
  statut de l'intégration : un rtl_433 arrêté (son « dernier message »
  `offline`) se voit, tant qu'aucun autre message n'arrive.
- Un appareil est identifié par `modèle:id<identifiant>:ch<canal>`, pour
  toujours. Ses fonctionnalités sont celles que ses messages ont portées.
- La liste de la Découverte est publiée 2 s après un nouveau capteur, au plus
  toutes les 30 s ; 500 capteurs au plus sont gardés en mémoire.
- Le badge d'un appareil ajouté passe à « injoignable » quand le broker est
  coupé, ou quand un capteur qui mesure régulièrement (température, vent,
  énergie…) n'a rien envoyé depuis une heure : piles à plat, hors de portée.
  Les télécommandes et les contacts, qui n'émettent qu'à l'usage, restent
  « local ».
- Les valeurs aberrantes (humidité de 255 %, -3276 °C…) sont ignorées.

## Dépannage

- **« Aucun événement rtl_433 »** au test : regardez `docker logs rtl_433`.
  `usb_claim_interface error -6` : le pilote TNT tient la clé (voir le
  matériel). Rien d'entendu : vérifiez la fréquence (`-f`) et l'antenne.
- **« Le broker MQTT est injoignable »** : vérifiez l'adresse IP et le port, et
  que le broker accepte les connexions du réseau local (`listener 1883` dans
  Mosquitto 2).
- **« a refusé la connexion »** : utilisateur ou mot de passe incorrect, ou
  ACL qui interdit la lecture de `rtl_433/#`.
- **Un capteur est entendu mais n'apparaît pas** : « Lister les capteurs
  entendus » indique « rien de pris en charge pour l'instant » quand aucun de
  ses champs n'est encore reconnu. Ouvrez une issue avec son message JSON
  (`docker logs rtl_433`).

## Confidentialité

Tout reste sur votre réseau : l'intégration ne parle qu'à votre broker MQTT (ou
à rtl_433). Le mot de passe est stocké comme secret par Gladys et n'apparaît
jamais dans les logs.
