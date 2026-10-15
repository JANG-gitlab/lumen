import type { ProjectVisual } from '../glass-sculpture/screens';

const unsplash = (id: string) => `https://images.unsplash.com/${id}?w=1600&q=80&fm=jpg`;

export interface Project extends ProjectVisual {
  readonly slug: string;
  readonly year: string;
  readonly client: string;
  readonly services: readonly string[];
  readonly summary: string;
  readonly body: readonly string[];
  /** Auteur de la photo (Unsplash), crédité sur la page projet. */
  readonly photographer: string;
}

export const PROJECTS: readonly Project[] = [
  {
    index: '01',
    slug: 'heliotrope',
    title: 'Heliotrope',
    role: 'Identité — Web3D',
    image: unsplash('photo-1746343365514-0c20c00a4318'),
    photographer: 'Declan Sun',
    year: '2026',
    client: 'Heliotrope Studio',
    services: ['Identité visuelle', 'Site Web3D', 'Direction artistique'],
    summary: 'Une identité qui suit la course du soleil : le logo tourne avec l’heure, le site change de lumière du matin au soir.',
    body: [
      'Heliotrope conçoit des verrières et des puits de lumière. Le studio voulait une présence qui parle de lumière sans jamais la montrer en photo.',
      'Le site est une scène 3D temps réel dont l’éclairage suit l’heure locale du visiteur. La typographie, étroite le matin, s’élargit à midi puis se resserre au couchant.',
    ],
  },
  {
    index: '02',
    slug: 'ghoster',
    title: 'Ghoster',
    role: 'Webdesign — Motion',
    image: unsplash('photo-1529455949509-8237a70382f0'),
    photographer: 'Randy Laybourne',
    year: '2026',
    client: 'Ghoster',
    services: ['Webdesign', 'Motion design', 'Prototype'],
    summary: 'Une application de messagerie éphémère : chaque écran s’efface comme une buée sur une vitre.',
    body: [
      'Ghoster supprime les messages après lecture. Le défi était de rendre la disparition rassurante plutôt qu’inquiétante.',
      'Toutes les transitions reposent sur un même flou progressif, réglé à la milliseconde, qui donne au produit sa signature.',
    ],
  },
  {
    index: '03',
    slug: 'null-forms',
    title: 'Null Forms',
    role: 'Web3D — Art',
    image: unsplash('photo-1759583545970-0106ff47353f'),
    photographer: 'Rohit Choudhari',
    year: '2025',
    client: 'Projet personnel',
    services: ['Web3D', 'Shaders', 'Installation'],
    summary: 'Une série de sculptures génératives qui n’existent que dans le navigateur, sculptées au champ de distance.',
    body: [
      'Null Forms explore des volumes impossibles à fabriquer : des gyroïdes, des rubans, des gouttes qui fusionnent.',
      'Chaque pièce tourne en temps réel sur le GPU du visiteur. Aucune n’est jamais rendue deux fois à l’identique.',
    ],
  },
  {
    index: '04',
    slug: 'noir-depot',
    title: 'Noir Dépôt',
    role: 'Identité — Packaging',
    image: unsplash('photo-1638126687923-31912a6ee0ff'),
    photographer: 'Thomas Murphy',
    year: '2025',
    client: 'Noir Dépôt',
    services: ['Identité visuelle', 'Packaging', 'Signalétique'],
    summary: 'Une torréfaction qui ne vend que du noir : une identité en une seule encre, sur papier kraft.',
    body: [
      'Noir Dépôt torréfie des cafés très sombres en petite série. La marque devait tenir sur un tampon et une étiquette.',
      'Le système repose sur une typographie massive et un code de trames qui indique l’intensité de chaque café.',
    ],
  },
  {
    index: '05',
    slug: 'piano-club',
    title: 'Piano Club',
    role: 'Identité — Affichage',
    image: unsplash('photo-1513883049090-d0b7439799bf'),
    photographer: 'Dolo Iglesias',
    year: '2024',
    client: 'Piano Club, Blois',
    services: ['Identité visuelle', 'Affiches', 'Programmation'],
    summary: 'Un club de jazz de poche : une affiche par soir, composée à partir des touches du clavier.',
    body: [
      'Le Piano Club programme un concert par soir dans une cave de soixante places. Chaque date méritait son affiche.',
      'Nous avons dessiné une grille de quatre-vingt-huit colonnes, une par touche : chaque affiche joue la mélodie d’ouverture du concert.',
    ],
  },
];
