// Source unique de verite pour les pieces d'avatar modulaire, partagee
// entre avatar-editor.html (creation) et twitch-chat-ink.html (rendu dans
// le chat). Modifier ici suffit a mettre a jour les deux.
window.AVATAR_PARTS_MANIFEST = {
  categories: [
    { key: 'base',    label: 'Base',    count: 3, optional: false },
    { key: 'eyes',    label: 'Yeux',    count: 3, optional: false },
    { key: 'antenna', label: 'Antenne', count: 3, optional: true },
    // Desactives en attendant les vrais dessins (retirer le commentaire une
    // fois les fichiers assets/parts/object-0X.png / hat-0X.png en place) :
    // { key: 'object',  label: 'Objet',   count: 3, optional: true },
    // { key: 'hat',     label: 'Chapeau', count: 3, optional: true },
  ],
  // Ordre d'empilement du bas vers le haut (le dernier est dessine en dernier,
  // donc par-dessus tous les autres). object/hat restent ici meme si
  // desactives ci-dessus : sans picker pour les choisir, cfg.object/cfg.hat
  // sont toujours null et donc simplement ignores au rendu (voir
  // resolveAvatar). Ca evite d'avoir a toucher cette liste en les
  // reactivant plus tard.
  renderOrder: ['base', 'object', 'eyes', 'hat', 'antenna'],
  partPath(category, index){
    return `assets/parts/${category}-0${index}.png`;
  },
  defaultConfig(){
    return { base: 1, eyes: 1, hat: null, antenna: null, object: null };
  }
};
