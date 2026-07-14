// Source unique de verite pour les pieces d'avatar modulaire, partagee
// entre avatar-editor.html (creation) et twitch-chat-ink.html (rendu dans
// le chat). Modifier ici suffit a mettre a jour les deux.
window.AVATAR_PARTS_MANIFEST = {
  categories: [
    { key: 'base',     label: 'Base',      count: 4,  optional: false },
    { key: 'eyes',     label: 'Yeux',      count: 10, optional: false },
    { key: 'antenna',  label: 'Antenne',   count: 9,  optional: false },
    { key: 'mandible', label: 'Mandibule', count: 7,  optional: false },
    // Desactives en attendant les vrais dessins (retirer le commentaire une
    // fois les fichiers assets/parts/object-0X.png / hat-0X.png en place -
    // il faudra aussi les rajouter a renderOrder ci-dessous a ce moment-la) :
    // { key: 'object',  label: 'Objet',   count: 3, optional: true },
    // { key: 'hat',     label: 'Chapeau', count: 3, optional: true },
  ],
  // Ordre d'empilement du bas vers le haut (le dernier est dessine en dernier,
  // donc par-dessus tous les autres). object/hat sont volontairement absents
  // ici tant qu'ils sont desactives ci-dessus : meme une ligne Supabase avec
  // d'anciennes valeurs (ex. avant leur desactivation) ne doit plus rien
  // afficher pour ces deux categories.
  renderOrder: ['base', 'eyes', 'mandible', 'antenna'],
  partPath(category, index){
    return `assets/parts/${category}-${String(index).padStart(2, '0')}.png`;
  },
  defaultConfig(){
    return { base: 1, eyes: 1, antenna: 1, mandible: 1, hat: null, object: null };
  }
};
