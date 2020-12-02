// add target="_blank" to link btns
setTimeout(function(){
	var all_link_btn_elements = document.getElementsByClassName("link-btn");
	for (var ii = 0; ii < all_link_btn_elements.length; ii++) {
		all_link_btn_elements[ii].getElementsByTagName("a")[0].target = "_blank";
		console.log(all_link_btn_elements[ii].getElementsByTagName("a")[0]);
	}
}, 3000);

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