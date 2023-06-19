function gotowhatsapp() {
    
    var name = document.getElementById("nombre").value;
    var clase = document.getElementById("clase").value;
    var cuando = document.getElementById("cuando").value;
    var email = document.getElementById("email").value;

    // Ingresa tu número de whatsapp aquí
    var url = "https://wa.me/+56983294729?text=" 
    + "Nombre: " + name + "%0a"
    + "clase: " + clase + "%0a"
    + "cuando: " + cuando  + "%0a"
    + "correo: " + email  + "%0a"

    window.open(url, '_blank').focus();
}