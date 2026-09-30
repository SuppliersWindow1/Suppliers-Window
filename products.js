// Produits de départ (chargés une seule fois si la base est vide)
module.exports=[
[1,"Pagne wax 6 yards","Mode","🧵",8500,4.7,32,"Coton wax imprimé, 6 yards (≈ 5,5 m x 1,15 m). Lavable à 30°C.","100% coton",96,"#f7d9a8"],
[2,"Chemise en tissu Kita","Mode","👔",15000,4.4,14,"Chemise cousue main, coupe droite, tailles S à XL.","Coton tissé",40,"#cfe3f7"],
[3,"Sandales en cuir","Mode","👡",12000,4.2,9,"Semelle souple, cuir véritable, pointures 38 à 45.","Cuir",25,"#e9d3c0"],
[4,"Écouteurs sans fil","Électronique","🎧",14500,4.1,21,"Bluetooth 5.3, 20 h d'autonomie avec boîtier, charge USB-C.","Plastique ABS",60,"#d6dcf5"],
[5,"Batterie externe 20 000 mAh","Électronique","🔋",18000,4.6,47,"Deux ports USB + USB-C, recharge rapide. 15 x 7 x 2,5 cm.","Polymère lithium",18,"#d3f0df"],
[6,"Ventilateur rechargeable","Électronique","🌀",27000,4.3,12,"3 vitesses, 8 h d'autonomie, pied réglable.","Plastique",4,"#d6e9f0"],
[7,"Marmite en aluminium 5 L","Maison","🍲",9500,4.5,18,"Fond épais, couvercle ajusté, convient aux feux à gaz et au charbon.","Aluminium",33,"#ead9d9"],
[8,"Lot de 6 verres","Maison","🥛",5000,3.9,7,"Verres résistants de 25 cl, passent au lave-vaisselle.","Verre trempé",70,"#e0eef7"],
[9,"Natte tressée","Maison","🧺",7000,4.8,26,"Natte artisanale, 180 x 120 cm, fibres naturelles.","Raphia",22,"#efe2b8"],
[10,"Masque sculpté en bois","Artisanat","🎭",32000,4.9,11,"Pièce unique sculptée à Ouidah, hauteur 38 cm.","Bois d'iroko",6,"#e3cdb3"],
[11,"Tableau en appliqué d'Abomey","Artisanat","🖼️",45000,4.8,8,"Tissu appliqué cousu main, 60 x 80 cm.","Coton",3,"#f3d1c4"],
[12,"Beurre de karité pur 250 g","Beauté","🧴",3500,4.6,63,"Non raffiné, pressé à froid. Hydrate peau et cheveux.","Karité 100%",120,"#f4ecd0"]
].map(function(a){return{name:a[1],category:a[2],emoji:a[3],price:a[4],rating:a[5],reviews:a[6],description:a[7],composition:a[8],stock:a[9]}});
