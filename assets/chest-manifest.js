// Manifest du systeme d'alertes "coffre" - parallele a parts-manifest.js.
//
// Centralise les paliers de recompense et les chemins d'assets, pour que
// chest-overlay.html n'ait jamais de chemin en dur. Voir assets/chest/CREDITS.md
// pour la provenance des fichiers (tous CC0 ou libres d'usage commercial).
(function(){

  // 3 paliers : commun (follow), rare (sub T1), epique (sub T2 et T3 confondus).
  const REWARD_ORDER = ['commun', 'rare', 'epique'];

  const REWARD_LABELS = {
    commun: 'Commun',
    rare: 'Rare',
    epique: 'Epique',
  };

  // Sprite de coffre (Seliel the Shaper - Treasure Chests) : un design distinct
  // par palier pour que la rarete se voit avant meme le resultat.
  function chestImage(reward, state){
    // state: 'closed' | 'open'
    return `assets/chest/chests/chest-${reward}-${state}.png`;
  }

  // Icone qui monte et devient LE resultat (Kenney Game Icons/Expansion).
  const REWARD_ICON = {
    commun: 'assets/chest/icons/medal1.png',
    rare: 'assets/chest/icons/star.png',
    epique: 'assets/chest/icons/trophy.png',
  };

  // Items decoratifs qui jaillissent du coffre en continu pendant la phase de
  // burst (jamais le resultat lui-meme) - simple pluie de pieces.
  const DECORATIVE_ICONS = ['assets/chest/icons/coin.png'];

  // Flipbook de feu d'artifice (8 frames, OpenGameArt "Fireworks") joue au
  // moment ou le resultat se revele.
  const FIREWORK_FRAMES = [0, 1, 2, 3, 4, 5, 6, 7].map(
    (n) => `assets/chest/fireworks/firework_red${n}.png`
  );

  // Nombre de videos disponibles par palier. Fichiers attendus :
  // assets/chest/videos/<palier>/1.mp4, 2.mp4, ... jusqu'a ce nombre.
  // A 0 : chest-overlay.html retombe sur une carte de recompense stylisee
  // (pas de video) - c'est le cas par defaut tant qu'aucune video n'est fournie.
  const VIDEO_COUNTS = {
    commun: 0,
    rare: 0,
    epique: 0,
  };

  function randomVideoPath(reward){
    const count = VIDEO_COUNTS[reward] || 0;
    if(count === 0) return null;
    const n = 1 + Math.floor(Math.random() * count);
    return `assets/chest/videos/${reward}/${n}.mp4`;
  }

  window.CHEST_MANIFEST = {
    rewardOrder: REWARD_ORDER,
    rewardLabels: REWARD_LABELS,
    chestImage,
    rewardIcon: REWARD_ICON,
    decorativeIcons: DECORATIVE_ICONS,
    fireworkFrames: FIREWORK_FRAMES,
    videoCounts: VIDEO_COUNTS,
    randomVideoPath,
  };

})();
