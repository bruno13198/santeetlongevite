 
// Script d'automatisation : récupère des études sur Europe PMC,
// génère 2 résumés en français via l'API Claude, et enregistre tout dans Supabase.
// Le filtrage "humain / pertinent" est fait par Claude lui-même, en lisant le résumé
// (plus fiable que les tags MeSH, qui manquent souvent sur les articles récents).
 
const { createClient } = require('@supabase/supabase-js');
 
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
 
const ALIMENTS_PILOTE = [
  { slug: 'curcuma-poudre', terme: 'turmeric curcumin' },
  { slug: 'ail-cru', terme: 'garlic Allium sativum' },
  { slug: 'saumon-elevage-cru', terme: 'salmon Salmo salar' },
  { slug: 'myrtille-crue', terme: 'blueberry Vaccinium' },
  { slug: 'brocoli-cru', terme: 'broccoli Brassica oleracea' },
  { slug: 'gingembre-poudre', terme: 'ginger Zingiber officinale' },
  { slug: 'cannelle-poudre', terme: 'cinnamon Cinnamomum' },
  { slug: 'romarin-frais', terme: 'rosemary Rosmarinus officinalis' },
  { slug: 'avocat-chair-sans-peau-sans-noyau-cru', terme: 'avocado Persea americana' },
  { slug: 'fraise-crue', terme: 'strawberry Fragaria' },
  { slug: 'framboise-crue', terme: 'raspberry Rubus idaeus' },
  { slug: 'grenade-chair-sans-peau-avec-pepins-crue', terme: 'pomegranate Punica granatum' },
  { slug: 'citron-vert-ou-lime-chair-sans-peau-sans-pepins-cru', terme: 'lime Citrus aurantifolia' },
  { slug: 'raisin-noir-cru', terme: 'grape Vitis vinifera' },
  { slug: 'epinard-cru', terme: 'spinach Spinacia oleracea' },
  { slug: 'oignon-cru', terme: 'onion Allium cepa' },
  { slug: 'patate-douce-crue', terme: 'sweet potato Ipomoea batatas' },
  { slug: 'tomate-sans-precision-crue-aliment-moyen', terme: 'tomato Solanum lycopersicum' },
  { slug: 'avoine-crue', terme: 'oat Avena sativa' },
  { slug: 'quinoa-cru', terme: 'quinoa Chenopodium quinoa' },
  { slug: 'lentille-verte-seche', terme: 'lentil Lens culinaris' },
  { slug: 'noix-cerneau-sechee', terme: 'walnut Juglans regia' },
  { slug: 'amande-grillee-salee', terme: 'almond Prunus dulcis' },
  { slug: 'noix-de-cajou-grillee-salee', terme: 'cashew Anacardium occidentale' },
  { slug: 'pistache-grillee-salee', terme: 'pistachio Pistacia vera' },
  { slug: 'noix-du-bresil-ou-noix-d-amazonie-sans-sel-ajoute', terme: 'Brazil nut Bertholletia excelsa' },
  { slug: 'noix-de-macadamia-grillee-salee', terme: 'macadamia nut' },
  { slug: 'noix-de-coco-chair-seche', terme: 'coconut Cocos nucifera' },
  { slug: 'sardine-crue', terme: 'sardine fish omega-3' },
  { slug: 'maquereau-cru', terme: 'mackerel fish omega-3' },
  { slug: 'hareng-cru', terme: 'herring fish omega-3' },
  { slug: 'kefir-de-lait', terme: 'kefir fermented milk' },
  { slug: 'yaourt-a-la-grecque-nature', terme: 'Greek yogurt' },
  { slug: 'huile-d-olive-vierge-extra', terme: 'extra virgin olive oil' },
  { slug: 'miel', terme: 'honey human health nutrition' },
  { slug: 'cafe-moulu', terme: 'coffee Coffea arabica' },
  { slug: 'chocolat-noir-70-de-cacao-environ-de-degustation-tablette', terme: 'dark chocolate cocoa flavanols' },
  { slug: 'vinaigre-de-cidre', terme: 'apple cider vinegar' },
  { slug: 'spiruline-spirulina-sp-sechee-ou-deshydratee', terme: 'spirulina Arthrospira' },
  { slug: 'chou-kale-cru', terme: 'kale Brassica oleracea acephala' },
  { slug: 'abat-cuit-aliment-moyen', terme: 'offal organ meat' },
  { slug: 'abricot-denoyaute-cru', terme: 'apricot Prunus armeniaca' },
  { slug: 'agar-algue-seche', terme: 'agar seaweed algae' },
  { slug: 'agneau-gigot-cru', terme: 'lamb meat' },
  { slug: 'amarante-crue', terme: 'amaranth grain' },
  { slug: 'ananas-chair-sans-peau-cru', terme: 'pineapple Ananas comosus' },
  { slug: 'anchois-cru', terme: 'anchovy fish' },
  { slug: 'aneth-frais', terme: 'dill herb' },
  { slug: 'anguille-crue', terme: 'eel fish' },
  { slug: 'anone-ou-cherimole-chair-sans-peau-crue', terme: 'cherimoya custard apple' },
  { slug: 'ao-nori-ulva-sp-ex-enteromorpha-sp-sechee-ou-deshydratee', terme: 'Ulva nori seaweed' },
  { slug: 'artichaut-cru', terme: 'artichoke Cynara scolymus' },
  { slug: 'asperge-verte-crue', terme: 'asparagus' },
  { slug: 'aubergine-crue', terme: 'eggplant aubergine Solanum melongena' },
  { slug: 'baie-de-goji-sechee', terme: 'goji berry Lycium barbarum' },
  { slug: 'bambou-pousse-crue', terme: 'bamboo shoot' },
  { slug: 'banane-plantain-crue', terme: 'plantain banana' },
  { slug: 'banane-chair-sans-peau-crue', terme: 'banana Musa' },
  { slug: 'bar-commun-ou-loup-cru', terme: 'sea bass fish' },
  { slug: 'basilic-frais', terme: 'basil Ocimum basilicum' },
  { slug: 'batavia-crue', terme: 'lettuce leafy greens' },
  { slug: 'baudroie-rousse-ou-lotte-crue', terme: 'monkfish' },
  { slug: 'bette-ou-blette-cote-sans-feuille-crue', terme: 'Swiss chard' },
  { slug: 'betterave-rouge-crue', terme: 'beetroot beet' },
  { slug: 'beurre-a-80-mg-minimum-doux', terme: 'butter dairy fat' },
  { slug: 'beurre-de-cacahuete-ou-pate-d-arachide', terme: 'peanut butter' },
  { slug: 'ble-de-khorasan-cru', terme: 'khorasan wheat kamut' },
  { slug: 'ble-dur-complet-cru', terme: 'durum whole wheat' },
  { slug: 'boeuf-cote-crue', terme: 'beef meat' },
  { slug: 'boulgour-de-ble-cru', terme: 'bulgur wheat' },
  { slug: 'brie-sans-precision', terme: 'brie cheese' },
  { slug: 'cabillaud-cru', terme: 'cod fish' },
  { slug: 'cacahuete-grillee-salee', terme: 'peanut Arachis hypogaea' },
  { slug: 'calmar-ou-calamar-ou-encornet-cru', terme: 'squid calamari' },
  { slug: 'camembert-au-lait-pasteurise', terme: 'camembert cheese' },
  { slug: 'canard-magret-cru', terme: 'duck meat' },
  { slug: 'canneberge-ou-cranberry-crue', terme: 'cranberry Vaccinium macrocarpon' },
  { slug: 'cantal', terme: 'cantal cheese hard cheese' },
  { slug: 'carambole-chair-et-peau-crue', terme: 'star fruit carambola' },
  { slug: 'cardamome-poudre', terme: 'cardamom spice' },
  { slug: 'cardon-cru', terme: 'cardoon Cynara cardunculus' },
  { slug: 'carotte-crue', terme: 'carrot Daucus carota' },
  { slug: 'carvi-graine', terme: 'caraway seed' },
  { slug: 'cassis-cru', terme: 'blackcurrant Ribes nigrum' },
  { slug: 'celeri-branche-cru', terme: 'celery' },
  { slug: 'celeri-rave-cru', terme: 'celeriac celery root' },
  { slug: 'cerfeuil-frais', terme: 'chervil herb' },
  { slug: 'cerise-acerola-chair-et-peau-sans-noyau-crue', terme: 'acerola cherry vitamin C' },
  { slug: 'ceriser-chair-et-peau-sans-noyau-crue', terme: 'sweet cherry Prunus avium' },
  { slug: 'champignon-de-paris-ou-champignon-de-couche-cru', terme: 'button mushroom Agaricus bisporus' },
  { slug: 'champignon-noir-seche', terme: 'wood ear mushroom black fungus' },
  { slug: 'champignon-cepe-cru', terme: 'porcini mushroom Boletus' },
  { slug: 'chanvre-ou-chenevis-graine-decortiquee', terme: 'hemp seed' },
  { slug: 'chataigne-crue', terme: 'chestnut' },
  { slug: 'chayote-ou-christophine-ou-chouchou-crue', terme: 'chayote squash' },
  { slug: 'cheddar', terme: 'cheddar cheese' },
  { slug: 'chia-graine-sechee', terme: 'chia seed' },
  { slug: 'chicoree-verte-crue', terme: 'chicory' },
  { slug: 'chlorelle-chlorella-sechee-ou-deshydratee', terme: 'chlorella' },
  { slug: 'chou-blanc-cru', terme: 'white cabbage' },
  { slug: 'chou-chinois-pe-tsai-cru', terme: 'napa cabbage Chinese cabbage' },
  { slug: 'chou-de-bruxelles-cru', terme: 'Brussels sprouts' },
  { slug: 'chou-romanesco-ou-brocoli-a-pomme-cru', terme: 'romanesco broccoli' },
  { slug: 'chou-rouge-cru', terme: 'red cabbage' },
  { slug: 'chou-vert-cru', terme: 'green cabbage' },
  { slug: 'chou-fleur-cru', terme: 'cauliflower' },
  { slug: 'chou-rave-cru', terme: 'kohlrabi' },
  { slug: 'ciboule-ou-ciboulette-fraiche', terme: 'chives' },
  { slug: 'citrouille-chair-sans-peau-crue', terme: 'pumpkin' },
  { slug: 'clam-praire-ou-palourde-cru', terme: 'clam' },
  { slug: 'clementine-ou-mandarine-chair-sans-peau-sans-pepins-crue', terme: 'mandarin clementine citrus' },
  { slug: 'clou-de-girofle', terme: 'clove spice Syzygium aromaticum' },
  { slug: 'coing-cru', terme: 'quince fruit' },
  { slug: 'comte', terme: 'Comté cheese hard cheese' },
  { slug: 'concombre-chair-et-peau-cru', terme: 'cucumber' },
  { slug: 'coquille-saint-jacques-noix-crue', terme: 'scallop' },
  { slug: 'coriandre-graine', terme: 'coriander seed' },
  { slug: 'courge-butternut-doubeurre-chair-sans-peau-crue', terme: 'butternut squash' },
  { slug: 'courge-crue', terme: 'squash' },
  { slug: 'courgette-puree', terme: 'zucchini courgette' },
  { slug: 'crabe-cru', terme: 'crab' },
  { slug: 'cresson-de-fontaine-cru', terme: 'watercress Nasturtium officinale' },
  { slug: 'crevette-crue', terme: 'shrimp prawn' },
  { slug: 'cumin-graine', terme: 'cumin seed' },
  { slug: 'curry-poudre', terme: 'curry powder spice blend' },
  { slug: 'datte-chair-et-peau-sans-noyau-seche', terme: 'date fruit Phoenix dactylifera' },
  { slug: 'dinde-aile-crue', terme: 'turkey meat' },
  { slug: 'dorade-royale-ou-daurade-ou-vraie-daurade-sauvage-crue', terme: 'sea bream fish' },
  { slug: 'dourian-ou-durian-chair-sans-peau-sans-noyau-cru', terme: 'durian fruit' },
  { slug: 'dulse-palmaria-palmata-sechee-ou-deshydratee', terme: 'dulse seaweed' },
  { slug: 'eau-de-coco', terme: 'coconut water' },
  { slug: 'echalote-crue', terme: 'shallot' },
  { slug: 'eglefin-cru', terme: 'haddock fish' },
  { slug: 'emmental-ou-emmenthal', terme: 'emmental cheese' },
  { slug: 'ecrevisse-crue', terme: 'crayfish' },
  { slug: 'edam', terme: 'edam cheese' },
  { slug: 'empereur-filet-sans-peau-cru', terme: 'emperor fish' },
  { slug: 'endive-crue', terme: 'endive chicory' },
  { slug: 'epeautre-cru', terme: 'spelt wheat' },
  { slug: 'eperlan-cru', terme: 'smelt fish' },
  { slug: 'epoisses', terme: 'Époisses cheese soft cheese' },
  { slug: 'escargot-cru', terme: 'snail escargot' },
  { slug: 'espadon-cru', terme: 'swordfish' },
  { slug: 'estragon-frais', terme: 'tarragon herb' },
  { slug: 'esturgeon-deurope-occidentale-cru', terme: 'sturgeon fish' },
  { slug: 'faisan-viande-crue', terme: 'pheasant meat' },
  { slug: 'farine-de-sarrasin', terme: 'buckwheat flour' },
  { slug: 'farine-de-pois-chiche', terme: 'chickpea flour' },
  { slug: 'feijoa-chair-sans-peau-crue', terme: 'feijoa fruit' },
  { slug: 'fenouil-cru', terme: 'fennel' },
  { slug: 'fenugrec-graine', terme: 'fenugreek seed' },
  { slug: 'feta-au-lait-de-brebis-70-minimum-et-lait-de-chevre-30-maximum', terme: 'feta cheese' },
  { slug: 'feve-seche', terme: 'fava bean' },
  { slug: 'figue-crue', terme: 'fig fruit Ficus carica' },
  { slug: 'fletan-de-l-atlantique-ou-fletan-cru', terme: 'halibut fish' },
  { slug: 'foie-de-morue-cru', terme: 'cod liver' },
  { slug: 'fruit-a-pain-cru', terme: 'breadfruit' },
  { slug: 'fruit-de-la-passion-ou-maracudja-chair-sans-peau-avec-pepins-cru', terme: 'passion fruit' },
  { slug: 'fruit-du-jacquier-ou-jacque-chair-sans-peau-cru', terme: 'jackfruit' },
  { slug: 'fucus-vesiculeux-fucus-serratus-ou-fucus-vesiculosus-seche-ou-deshydrate', terme: 'bladderwrack seaweed Fucus' },
  { slug: 'gelatine-seche', terme: 'gelatin collagen' },
  { slug: 'gelee-royale', terme: 'royal jelly' },
  { slug: 'germe-de-ble', terme: 'wheat germ' },
  { slug: 'gombo-fruit-cru', terme: 'okra' },
  { slug: 'goyave-chair-sans-peau-crue', terme: 'guava' },
  { slug: 'graine-germee-de-haricot-mungo-ou-pousse-de-soja-crue', terme: 'mung bean sprouts' },
  { slug: 'graine-germee-de-luzerne-crue', terme: 'alfalfa sprouts' },
  { slug: 'griotte-crue', terme: 'sour cherry Prunus cerasus' },
  { slug: 'groseille-crue', terme: 'redcurrant Ribes rubrum' },
  { slug: 'gruyere-sans-precision-origine-france-ou-suisse', terme: 'Gruyère cheese' },
  { slug: 'haricot-blanc-sec', terme: 'white bean' },
  { slug: 'haricot-rouge-sec', terme: 'kidney bean' },
  { slug: 'haricot-vert-cru', terme: 'green bean' },
  { slug: 'huile-de-colza', terme: 'rapeseed canola oil' },
  { slug: 'huile-de-lin', terme: 'flaxseed oil' },
  { slug: 'huile-de-noix', terme: 'walnut oil' },
  { slug: 'huile-de-tournesol', terme: 'sunflower oil' },
  { slug: 'huile-de-sesame', terme: 'sesame oil' },
  { slug: 'huile-d-avocat', terme: 'avocado oil' },
  { slug: 'huile-de-foie-de-morue', terme: 'cod liver oil' },
  { slug: 'huile-ou-graisse-de-coco-vierge', terme: 'virgin coconut oil' },
  { slug: 'huitre-creuse-crue', terme: 'oyster' },
  { slug: 'jambon-sec', terme: 'cured ham processed meat' },
  { slug: 'jus-d-orange-frais', terme: 'orange juice' },
  { slug: 'jus-de-pomme-pur-jus', terme: 'apple juice' },
  { slug: 'jus-de-raisin-pur-jus', terme: 'grape juice' },
  { slug: 'jus-de-grenade-frais', terme: 'pomegranate juice' },
  { slug: 'jus-de-pruneau', terme: 'prune juice' },
  { slug: 'kiwi-chair-sans-peau-avec-pepins-cru', terme: 'kiwifruit' },
  { slug: 'kombu-ou-kombu-japonais-saccharina-japonica-seche-ou-deshydrate', terme: 'kombu seaweed' },
  { slug: 'kumquat-chair-et-peau-sans-pepin-cru', terme: 'kumquat' },
  { slug: 'herbes-de-provence-sechees', terme: 'herbes de Provence dried herbs' },
  { slug: 'hoki-tout-lieu-de-peche-cru', terme: 'hoki fish' },
  { slug: 'homard-cru', terme: 'lobster' },
  { slug: 'huile-d-amande', terme: 'almond oil' },
  { slug: 'huile-d-arachide', terme: 'peanut oil groundnut oil' },
  { slug: 'huile-d-argan-ou-d-argane', terme: 'argan oil' },
  { slug: 'huile-de-cameline', terme: 'camelina oil' },
  { slug: 'huile-de-chanvre', terme: 'hemp oil' },
  { slug: 'huile-de-noisette', terme: 'hazelnut oil' },
  { slug: 'huile-de-palme-raffinee', terme: 'palm oil' },
  { slug: 'huile-de-pepins-de-raisin', terme: 'grapeseed oil' },
  { slug: 'huile-de-soja', terme: 'soybean oil' },
  { slug: 'huile-ou-beurre-de-cacao', terme: 'cocoa butter' },
  { slug: 'huile-ou-beurre-de-karite', terme: 'shea butter' },
  { slug: 'huitre-plate-crue', terme: 'oyster' },
  { slug: 'igname-crue', terme: 'yam Dioscorea' },
  { slug: 'isolat-de-soja', terme: 'soy protein isolate' },
  { slug: 'jambon-cru', terme: 'cured ham processed meat' },
  { slug: 'jus-d-ananas-pur-jus', terme: 'pineapple juice' },
  { slug: 'jus-de-mangue-frais', terme: 'mango juice' },
  { slug: 'kaki-chair-et-peau-cru', terme: 'persimmon kaki' },
  { slug: 'kombu-breton-laminaria-digitata-seche-ou-deshydrate', terme: 'kombu seaweed Laminaria' },
  { slug: 'lait-de-brebis-entier', terme: 'sheep milk' },
  { slug: 'lait-de-chevre-entier-uht', terme: 'goat milk' },
  { slug: 'lait-de-coco', terme: 'coconut milk' },
  { slug: 'lait-entier-cru', terme: 'whole cow milk' },
  { slug: 'lait-fermente-type-yaourt-au-bifidus-nature', terme: 'fermented milk bifidus yogurt' },
  { slug: 'laitue-iceberg-crue', terme: 'iceberg lettuce' },
  { slug: 'laitue-romaine-crue', terme: 'romaine lettuce' },
  { slug: 'langouste-crue', terme: 'spiny lobster' },
  { slug: 'langoustine-crue', terme: 'langoustine Norway lobster' },
  { slug: 'lapin-viande-crue', terme: 'rabbit meat' },
  { slug: 'laurier-feuille', terme: 'bay leaf laurel' },
  { slug: 'lentille-blonde-seche', terme: 'lentil' },
  { slug: 'lentille-corail-seche', terme: 'red lentil' },
  { slug: 'levure-de-biere-en-paillettes', terme: "brewer's yeast" },
  { slug: 'lieu-jaune-ou-colin-cru', terme: 'pollock fish' },
  { slug: 'lieu-noir-cru', terme: 'saithe coalfish' },
  { slug: 'limande-crue', terme: 'dab flatfish' },
  { slug: 'lin-graine', terme: 'flaxseed linseed' },
  { slug: 'litchi-chair-sans-peau-sans-noyau-cru', terme: 'lychee litchi' },
  { slug: 'longan-chair-sans-peau-sans-noyau-cru', terme: 'longan fruit' },
  { slug: 'lupin-graine-sec', terme: 'lupin bean' },
  { slug: 'mache-crue', terme: "lamb's lettuce corn salad" },
  { slug: 'mais-doux-surgele-cru', terme: 'sweet corn maize' },
  { slug: 'mangue-chair-sans-peau-sans-noyau-crue', terme: 'mango Mangifera indica' },
  { slug: 'manioc-racine-crue', terme: 'cassava manioc' },
  { slug: 'marjolaine-sechee', terme: 'marjoram herb' },
  { slug: 'menthe-sechee', terme: 'mint herb' },
  { slug: 'merlan-cru', terme: 'whiting fish' },
  { slug: 'merlu-cru', terme: 'hake fish' },
  { slug: 'mil-complet-cru', terme: 'millet grain' },
  { slug: 'miso', terme: 'miso fermented soybean' },
  { slug: 'moringa-gousse-cru', terme: 'moringa' },
  { slug: 'morue-salee-seche', terme: 'salted cod' },
  { slug: 'moule-commune-crue', terme: 'mussel' },
  { slug: 'moutarde', terme: 'mustard condiment' },
  { slug: 'mozzarella-au-lait-de-vache', terme: 'mozzarella cheese' },
  { slug: 'mure-de-ronce-crue', terme: 'blackberry Rubus fruticosus' },
  { slug: 'navet-cuit', terme: 'turnip' },
  { slug: 'nectarine-ou-brugnon-jaune-chair-et-peau-sans-noyau-crue', terme: 'nectarine' },
  { slug: 'noisette-sans-sel-ajoute', terme: 'hazelnut Corylus avellana' },
  { slug: 'noix-de-muscade', terme: 'nutmeg spice' },
  { slug: 'noix-de-pecan-salees', terme: 'pecan nut' },
  { slug: 'nori-porphyra-sp-pyropia-sechee-ou-deshydratee', terme: 'nori seaweed Porphyra' },
  { slug: 'oeuf-cru', terme: 'egg chicken egg' },
  { slug: 'oie-viande-crue', terme: 'goose meat' },
  { slug: 'oignon-jaune-cru', terme: 'yellow onion' },
  { slug: 'oignon-rouge-cru', terme: 'red onion' },
  { slug: 'olive-noire-en-saumure-egouttee', terme: 'black olive' },
  { slug: 'olive-verte-en-saumure-egouttee', terme: 'green olive' },
  { slug: 'orange-chair-sans-peau-sans-pepins-crue', terme: 'orange citrus' },
  { slug: 'orge-complete-crue', terme: 'barley whole grain' },
  { slug: 'origan-seche', terme: 'oregano herb' },
  { slug: 'ormeau-cru', terme: 'abalone' },
  { slug: 'oseille-crue', terme: 'sorrel' },
  { slug: 'pain-au-levain', terme: 'sourdough bread' },
  { slug: 'pain-blanc-par-ex-baguette-boule', terme: 'white bread wheat bread' },
];
 
// On demande plus de résultats à Europe PMC que nécessaire, car une partie
// sera écartée par le filtre de pertinence humaine (voir plus bas).
const RESULTATS_A_RECUPERER = 20;
const MAX_ETUDES_PAR_ALIMENT = 8;
// Aliments NOVA 4 (ultra-transformés) qu'on choisit quand même de couvrir,
// car leur transformation ou leur usage a une littérature scientifique dédiée.
const EXCEPTIONS_NOVA4 = [
  'isolat-de-soja',
  'cola-sucre',
  'lecithine-de-soja',
]; 
async function chercherEtudesEuropePMC(terme) {
  // On cible le titre et le résumé (au lieu du texte complet / mots-clés / affiliations)
  // pour ne récupérer que des études réellement centrées sur l'aliment recherché.
  const motsClefs = terme
    .split(' ')
    .map((mot) => `(TITLE:"${mot}" OR ABSTRACT:"${mot}")`)
    .join(' AND ');
  const requete = `(${motsClefs}) AND (SRC:MED) AND (PUB_TYPE:"review" OR PUB_TYPE:"meta-analysis" OR PUB_TYPE:"systematic review" OR PUB_TYPE:"randomized controlled trial" OR PUB_TYPE:"clinical trial")`;
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(requete)}&format=json&pageSize=${RESULTATS_A_RECUPERER}&resultType=core`;
 
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Europe PMC erreur ${res.status}`);
  const data = await res.json();
  return data.resultList?.result || [];
}
 
async function analyserEtude(titreOriginal, abstractOriginal, nomAliment) {
  const prompt = `Tu es un rédacteur scientifique qui vulgarise des études de nutrition/santé pour un site grand public francophone.
 
Cette étude a été trouvée en recherchant des publications sur : ${nomAliment}
 
Titre original : ${titreOriginal}
Résumé original (anglais) : ${abstractOriginal}
 
Étape 1 — Vérifie le SUJET :
L'étude parle-t-elle vraiment et spécifiquement de « ${nomAliment} » (ou d'un synonyme/nom scientifique direct de cet aliment) ? Une simple co-occurrence de mots-clés ou une confusion terminologique (ex : un homonyme, une espèce différente, un aliment qui n'apparaît que dans la bibliographie ou en comparaison lointaine) ne compte pas. Si l'étude porte en réalité sur un autre sujet qui a seulement été mal indexé sous ce terme de recherche, réponds "false".
 
Étape 2 — Évalue la pertinence humaine :
Cette étude concerne-t-elle la santé, la nutrition ou la physiologie HUMAINE (directement, ou via une méta-analyse/revue qui synthétise des données humaines) ?
Réponds "false" si l'étude porte uniquement sur : des animaux (vétérinaire, élevage, modèles animaux sans lien direct avec la santé humaine), des plantes (agronomie, botanique pure), des microbes/environnement sans lien santé humaine, ou tout autre sujet hors nutrition/santé humaine.
 
Étape 3 — Si et seulement si pertinente sur les deux points ci-dessus, rédige les résumés en français.
 
Réponds UNIQUEMENT avec un objet JSON valide (rien avant, rien après), au format EXACT suivant. N'utilise JAMAIS de guillemets doubles (") à l'intérieur des textes — utilise des guillemets français « » ou des apostrophes si besoin. N'utilise JAMAIS de retour à la ligne à l'intérieur des valeurs texte — rédige chaque champ comme un seul paragraphe continu, sans saut de ligne.
 
Si l'étude N'EST PAS pertinente :
{
  "pertinent": false,
  "raison": "courte explication en français (une phrase)"
}
 
Si l'étude EST pertinente :
{
  "pertinent": true,
  "titre_traduit": "traduction française naturelle du titre",
  "resume_simplifie": "un résumé très simple et accessible en français (80-120 mots), sans jargon, compréhensible par un lecteur non-scientifique",
  "resume_reformule": "une reformulation plus détaillée en français (100-150 mots), qui garde davantage de nuance scientifique et de précision, mais reste lisible"
}
 
Règles importantes :
- Ne jamais transformer une corrélation en causalité si l'étude ne le permet pas
- Rester factuel, ne pas exagérer les conclusions
- Varier le style et la structure des phrases (éviter les formulations répétitives d'un résumé à l'autre)
- Rédiger uniquement en français`;
 
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
 
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erreur API Claude ${res.status}: ${errText}`);
  }
 
  const data = await res.json();
  const texte = data.content.map((b) => b.text || '').join('');
  const nettoye = texte.replace(/```json|```/g, '').trim();
  const match = nettoye.match(/\{[\s\S]*\}/);
 
  try {
    return JSON.parse(match ? match[0] : nettoye);
  } catch (e) {
    throw new Error(`JSON invalide reçu de Claude : ${e.message} | Début du texte reçu : ${nettoye.slice(0, 200)}`);
  }
}
 
async function traiterAliment(aliment) {
  console.log(`\n=== ${aliment.slug} ===`);
 
  const { data: alimentDB, error: erreurAliment } = await supabase
    .from('aliments')
    .select('id, niveau_nova')
    .eq('slug', aliment.slug)
    .single();

  if (erreurAliment || !alimentDB) {
    console.log(`  Aliment introuvable en base, on saute.`);
    return;
  }

  if (alimentDB.niveau_nova === 4 && !EXCEPTIONS_NOVA4.includes(aliment.slug)) {
    console.log(`  Aliment NOVA 4 (ultra-transformé), non listé en exception, on saute.`);
    return;
  }
 
  // On vérifie combien d'études existent déjà pour cet aliment, pour éviter
  // d'appeler inutilement l'API si le quota est déjà atteint.
  const { count: nbExistantes } = await supabase
    .from('aliments_etudes')
    .select('*', { count: 'exact', head: true })
    .eq('aliment_id', alimentDB.id);
 
  if ((nbExistantes || 0) >= MAX_ETUDES_PAR_ALIMENT) {
    console.log(`  Déjà ${nbExistantes} études en base (quota ${MAX_ETUDES_PAR_ALIMENT} atteint), on saute — aucun appel API.`);
    return;
  }
 
  const resultats = await chercherEtudesEuropePMC(aliment.terme);
  console.log(`  ${resultats.length} études trouvées sur Europe PMC (avant filtrage humain).`);
 
  let etudesAjoutees = nbExistantes || 0;
 
  for (const etude of resultats) {
    if (etudesAjoutees >= MAX_ETUDES_PAR_ALIMENT) {
      console.log(`  - Quota de ${MAX_ETUDES_PAR_ALIMENT} atteint, on arrête ici.`);
      break;
    }
 
    const sourceId = etude.id || etude.pmid;
    if (!sourceId) continue;
 
    const { data: existant } = await supabase
      .from('etudes')
      .select('id')
      .eq('source', 'Europe PMC')
      .eq('source_id', sourceId)
      .maybeSingle();
 
    if (existant) {
      console.log(`  - Déjà en base (${sourceId}), on passe.`);
      continue;
    }
 
    if (!etude.abstractText) {
      console.log(`  - Pas de résumé disponible pour ${sourceId}, on passe.`);
      continue;
    }
 
    const { data: dejaRejete } = await supabase
      .from('candidats_rejetes')
      .select('source_id')
      .eq('aliment_id', alimentDB.id)
      .eq('source_id', sourceId)
      .maybeSingle();
 
    if (dejaRejete) {
      console.log(`  - Déjà rejeté précédemment (${sourceId}), on passe.`);
      continue;
    }
 
    try {
      const analyse = await analyserEtude(etude.title, etude.abstractText, aliment.terme);
 
      if (!analyse.pertinent) {
        console.log(`  - Écartée (${sourceId}) : ${analyse.raison}`);
        await supabase.from('candidats_rejetes').insert({ aliment_id: alimentDB.id, source_id: sourceId });
        continue;
      }
 
      const { data: nouvelleEtude, error: erreurInsert } = await supabase
        .from('etudes')
        .insert({
          titre_original: etude.title,
          titre_traduit: analyse.titre_traduit,
          source: 'Europe PMC',
          source_id: sourceId,
          url_originale: `https://europepmc.org/article/MED/${sourceId}`,
          date_publication: etude.firstPublicationDate || null,
          auteurs: etude.authorString || null,
          resume_original: etude.abstractText,
          resume_simplifie: analyse.resume_simplifie,
          resume_reformule: analyse.resume_reformule,
        })
        .select('id')
        .single();
 
      if (erreurInsert) {
        console.log(`  - Erreur insertion étude ${sourceId}:`, erreurInsert.message);
        continue;
      }
 
      await supabase.from('aliments_etudes').insert({
        aliment_id: alimentDB.id,
        etude_id: nouvelleEtude.id,
      });
 
      etudesAjoutees++;
      console.log(`  - Ajoutée : ${analyse.titre_traduit}`);
    } catch (e) {
      console.log(`  - Erreur traitement ${sourceId}:`, e.message);
    }
  }
}
 
async function main() {
  for (const aliment of ALIMENTS_PILOTE) {
    try {
      await traiterAliment(aliment);
    } catch (e) {
      console.log(`Erreur générale sur ${aliment.slug}:`, e.message);
    }
  }
  console.log('\nTerminé.');
}
 
main();
 
