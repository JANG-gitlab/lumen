# Prompt : fusionner la lame projet dans la sculpture de verre (structure unique, vrai rectangle, morph progressif)

Colle tout ce document à un Claude qui ne connait pas le projet. Il contient tout le contexte nécessaire. Ne saute aucune section.

## 1. Contexte projet

Site vitrine portfolio "Lumen", une seule page avec fond WebGPU fixe plein écran. Une sculpture de verre raymarchée en SDF réagit au scroll. Stack : Vite 8.3.1, React 19, TypeScript strict, lib `vgpu@0.5.0`, CSS manuel. Dossier de travail : racine du projet (ce fichier est à la racine).

Pipeline de rendu : `sculpture` (raymarch verre, HDR) puis `bloom` (extract, blur H, blur V) puis `present` (tonemap ACES, vignette, grain). Aucun overlay 2D par dessus le canvas, tout vit dans la matière 3D.

Commandes exactes :
- `npm run dev` (serveur sur `http://localhost:5173/`)
- `npm run check` (doit finir à 0)
- `npm run build` (doit finir à 0)
- validation WGSL via le check vgpu intégré (les deux shaders `sculpture.wgsl` et `present.wgsl` doivent compiler)

Fichiers concernés, dans l'ordre de lecture :
1. `glass-sculpture/sculpture.wgsl` (490 lignes, le shader, c'est là que tout se joue)
2. `glass-sculpture/scene.ts` (`ScenePanelFrame`, bindings des uniforms, pipeline)
3. `src/components/GlassBackdrop.tsx` (`glassMorph`, pilote le morph au scroll)
4. `glass-sculpture/screens.ts` (atlas texture des visuels projets)
5. `src/projects.ts` (5 projets avec images Unsplash temporaires)
6. `glass-sculpture/renderer.ts` (crée la galerie en async, boucle de rendu)
7. `glass-sculpture/present.wgsl` (simple, tonemap seulement, ne pas y remettre de panneau)

## 2. Objectif exact (exigence utilisateur, à respecter à la lettre)

Dans la zone projets au scroll, un morceau de la sculpture doit se déformer pour accueillir chaque projet, comme partie du verre lui même. Concrètement :
- c'est un vrai RECTANGLE (ratio paysage type 16/10, paramétrable), pas un carré 1x1 ;
- il se MORPHE PROGRESSIVEMENT comme les autres formes de la sculpture (même sensation de déformation continue, pas d'apparition brutale) ;
- verre et rectangle forment UNE SEULE STRUCTURE (on ne doit jamais voir deux entités distinctes, pas de plaque posée devant le blob) ;
- entre chaque projet, le rectangle se replie dans la matière puis ressort avec le projet suivant (chaque projet a sa respiration) ;
- chaque projet affiche sa preview (images Unsplash temporaires, voir `src/projects.ts`) avec un effet liquid glass par dessus (ondulation subtile, fresnel, reflet studio, liseré de tranche).

## 3. État actuel du code (ne réinvente rien, pars de là)

Uniforms panel dans `SculptureParams` (`sculpture.wgsl` lignes 21 à 25) : `panel_morph, panel_index, panel_index_next, panel_mix, panel_count`. Bindings : `project_texture` en binding 1, `linear_sampler` en binding 2.

Géométrie actuelle (`panel_distance`, lignes 171 à 185) : rounded box avec `center = mix(0.0, 0.98, ease)`, `extent = mix(0.02, 0.62, ease)`, `half_thickness = mix(0.16, 0.07, ease)`, `bounds = vec3f(extent, extent, half_thickness)`. Sortie anticipée si `morph <= 0.001` (retourne 1000.0). Orientation selon `yaw` uniquement.

Union actuelle (`sculpture_distance`, lignes 299 à 309) : `smooth_union(blob, panel, mix(0.06, 0.28, panel_morph))` si morph > 0.001.

Ombrage actuel (`shade_panel`, lignes 201 à 258) : UV `u` depuis l'axe tangent, `v` inversé (haut carte à v=0), ondulation sinusoïdale amortie par `ease`, échantillonnage atlas une rangée par projet avec `mix` entre index courant et suivant, mélange contenu et reflet studio (fresnel fois 0.45 puis re-mélange 0.72 vers contenu), speculaire blanc, liseré de bord.

Classification actuelle (`fs_main`, ligne 445) : si `panel_morph > 0.001` et `panel_distance(point) < blob_distance(point) - 0.01`, alors `shade_panel`, sinon ombrage verre classique (réfraction RGB avec dispersion, fresnel, key, rim).

Blob (`blob_distance`, lignes 263 à 297) : rotation temporelle (`time * 0.25`), morph entre formes via `shape` float et `blend`, fragmentation latérale avec `split_amount = split * (1.0 - 0.6 * panel_morph)`.

Pilotage (`glassMorph` dans `GlassBackdrop.tsx`, lignes 32 à 56) : par projet, `x = progress * count`, `index = floor(x)`, `local = x - index`, `emerge = easeOutCubic(local / 0.18)`, `reabsorb = 1 - easeOutCubic((local - 0.82) / 0.18)`, `morph = emerge * reabsorb`, `mix = 0`, `nextIndex = index`.

Atlas (`screens.ts`) : colonne unique (`COLS = 1`, `TILE = 768`, `MAX_ROWS = 8`), `createProjectGallery` async, chargement images avec `crossOrigin = 'anonymous'` (requis pour `getImageData`), dessin `cover` centré, voile de lisibilité, upload par `writeTexture` avec `getImageData` (ne jamais revenir à `copyExternalImageToTexture`, il produisait une texture noire).

## 4. Ce qui ne va pas (diagnostic à confirmer puis corriger)

a) Carré au lieu de rectangle : `bounds = vec3f(extent, extent, half_thickness)` utilise deux fois `extent`, donc ratio 1x1. Il faut deux demi étendues distinctes (largeur, hauteur) avec le ratio paysage voulu, et des UV normalisés en conséquence.
b) Morph non progressif façon formes : les formes se mélangent via le float `shape` et `blend` dans le blob, en continu. La lame utilise un `ease` séparé plus un seuil brutal (`<= 0.001` qui renvoie 1000.0) et une branche binaire dans `fs_main`. Résultat : apparition mécanique, pas une déformation organique.
c) Deux entités visibles : l'union douce seule ne suffit pas. La normale de la lame est calculée sur `panel_distance` seul, l'ombrage bifurque entre deux matériaux, donc l'oeil sépare la plaque du blob. Il faut une continuité de matière (normale commune issue du SDF uni, même BRDF verre, contenu réfracté à l'intérieur plutôt que plaqué).
d) Points de vigilance : orientation yaw seul (le pitch caméra est ignoré), `center` qui translate vers la caméra au lieu de déformer sur place, épaisseur qui ne suit pas le ratio.

## 5. Travail demandé (dans cet ordre)

1. Remplacer le carré par un vrai rectangle paysage paramétrable (largeur, hauteur, rayon d'arrondi, épaisseur), avec UV `u` et `v` normalisés sur ces demi étendues.
2. Refaire le morph pour qu'il soit progressif comme les autres formes : même famille d'easing, pas de seuil qui fait pop, transition continue du SDF et de la normale du début à la fin du déploiement et du repli.
3. Faire UNE structure unique : déformer le blob lui même vers le rectangle (ou union avec continuité de normale et de matériau), un seul chemin d'ombrage verre, le contenu projet échantillonné comme une réfraction interne avec l'effet liquid glass (garder ondulation, fresnel, reflet, liseré, mais intégrés au verre, pas en surcouche).
4. Garder le cycle par projet (émergence 18 pourcent, repli 18 pourcent), les images Unsplash, l'atlas colonne unique et le `mix` à 0.
5. Garder les perfs : marche limitée (112 pas max), epsilons actuels, `renderScale` 0.5 dans `GlassBackdrop`, pas d'échantillonnage texture supplémentaire inutile.

Critères d'acceptation : ratio rectangle visible et stable, aucune discontinuité visible entre lame et blob pendant le morph, repli total entre projets (morph retombe à 0), `npm run check` et `npm run build` à 0, zéro erreur console et WebGPU.

## 6. Contraintes non négociables

DA stricte noir et blanc (pas de couleur ajoutée, les photos sont l'exception temporaire). Pas d'overlay 2D ni de panneau glissant depuis un bord. En WGSL, tout `if` avec une instruction doit avoir des accolades (sinon le pipeline ne compile pas). TypeScript strict, code lisible, commentaires en français quand utiles, noms de variables propres, pas de code mort. Ne jamais trahir une génération IA dans le code livré.

## 7. Comment vérifier (l'assistant ne peut pas lire les images, donc stats pixels)

Utiliser Playwright (Chrome headless) contre `http://localhost:5173/` plus `pngjs` pour les stats, jamais d'appréciation visuelle directe. Méthode : `networkidle`, attendre 4 à 5 secondes (chargement async des images), scroller à des fractions de la hauteur totale, attendre 2 secondes, screenshot, analyser zones et grilles (moyenne, min, écart type, pourcentage de pixels colorés avec écart max moins min des canaux supérieur à 15). Attendus quand ça marche : pixels colorés présents dans la lame (photos), texte sombre détecté (min bas), liseré de bord (pics lumineux), zéro erreur. Scripts de test existants dans `/var/folders/9k/5890lwmj2530g1y5r26q9xj00000gn/T/opencode` (`lumen-grid-test.mjs`, `lumen-color-test.mjs`, `lumen-lame-zone.mjs`), réutilisables et adaptables.

## 8. Avant de coder, demande à l'utilisateur

Le ratio exact du rectangle (16/10 par défaut ?), s'il doit suivre le pitch caméra ou rester face caméra en yaw seul, et si l'ondulation liquid glass doit rester animée en continu ou seulement pendant le morph. Si pas de réponse, prends 16/10, yaw seul, ondulation continue subtile.

## 9. Livrables

Diff par fichier avec explication courte des choix SDF et d'ombrage, commandes lancées avec résultats (`check`, `build`, tests pixels avec chiffres avant et après), et ce qu'il reste à régler côté DA (taille, position, amplitude de l'ondulation).
