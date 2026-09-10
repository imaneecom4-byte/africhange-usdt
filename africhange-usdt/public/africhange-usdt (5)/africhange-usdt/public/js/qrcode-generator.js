// =====================================================================
// qrcode-generator.js
// Récupère l'adresse USDT actuelle (configurable par l'admin) et
// affiche son QR code, généré côté serveur via la librairie "qrcode"
// (voir /api/qrcode-usdt dans server.js) pour éviter de dupliquer une
// librairie de génération de QR côté client.
// =====================================================================

async function afficherQrCodeUsdt(idImage, idAdresseTexte) {
  const conteneurImage = document.getElementById(idImage);
  const conteneurAdresse = document.getElementById(idAdresseTexte);

  try {
    const res = await fetch('/api/qrcode-usdt');
    if (!res.ok) throw new Error('QR code indisponible');
    const { qrcode, adresse } = await res.json();

    conteneurImage.innerHTML = `<img src="${qrcode}" alt="QR code de l'adresse USDT" class="rounded-2xl" />`;
    if (conteneurAdresse) conteneurAdresse.textContent = adresse;
    return adresse;
  } catch (e) {
    conteneurImage.innerHTML = `<p class="text-sm text-rose-400">Impossible d'afficher le QR code pour le moment. Utilisez l'adresse ci-dessous.</p>`;
  }
}

// Copie rapide de l'adresse dans le presse-papiers, avec retour visuel
function copierAdresse(idAdresseTexte, idBouton) {
  const texte = document.getElementById(idAdresseTexte).textContent;
  navigator.clipboard.writeText(texte).then(() => {
    const bouton = document.getElementById(idBouton);
    const original = bouton.textContent;
    bouton.textContent = 'Copié !';
    setTimeout(() => { bouton.textContent = original; }, 1500);
  });
}
