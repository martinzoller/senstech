// add links to senstech wiki
frappe.provide('frappe.help.help_links');

frappe.call({
	method: 'senstech.utils.get_help_links',
	callback: function(r) {
		if(r.message) {
			var links = r.message;
			for (var i = 0; i < links.length; i++) {
				frappe.help.help_links['List/' + links[i].doctype_link] = [
					{ label: 'Senstech Wiki', url: links[i].url },
				];
				frappe.help.help_links['Form/' + links[i].doctype_link] = [
					{ label: 'Senstech Wiki', url: links[i].url },
				];
				frappe.help.help_links['Tree/' + links[i].doctype_link] = [
					{ label: 'Senstech Wiki', url: links[i].url },
				];
			}
		} 
	}
});