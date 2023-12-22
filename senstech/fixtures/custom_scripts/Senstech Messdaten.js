frappe.ui.form.on('Senstech Messdaten', {
	refresh(frm) {
			frm.add_custom_button(__("Einzelsensor-Labels drucken"), function() {
				print_labels(frm);
			});
	}
})

function print_labels(frm) {
	frappe.call({
    	'method': 'senstech.senstech.doctype.senstech_messdaten.senstech_messdaten.print_single_sensor_labels',
    	'args': {
    		'measurement_id': frm.doc.name,
    	},
		'callback': function(response) {
		}
    });
}