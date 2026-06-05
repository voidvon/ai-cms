document.writeln("        <SCRIPT language=javascript type=text\/javascript>");
document.writeln("var focus_width=980;\/\/宽度");
document.writeln("var focus_height=188;\/\/高度");
document.writeln("var text_height=0;\/\/显示文字的高度");
document.writeln("var swf_height = focus_height;");
document.writeln("      ");
document.writeln("var pics=\'\/images\/22.jpg|\/images\/33.jpg|\/images\/44.jpg|\/images\/55.jpg|\/images\/66.jpg\'; \/\/链接图片");
document.writeln("var links=\'\';\/\/链接网址");
document.writeln("var texts=\'\';\/\/链接文本说明");
document.writeln("      ");
document.writeln("document.write(\'<object classid=\"clsid:d27cdb6e-ae6d-11cf-96b8-444553540000\" codebase=\"http:\/\/fpdownload.macromedia.com\/pub\/shockwave\/cabs\/flash\/swflash.cab#version=6,0,0,0\" width=\"\'+ focus_width +\'\" height=\"\'+ swf_height +\'\">\');");
document.writeln("document.write(\'<param name=\"allowScriptAccess\" value=\"sameDomain\"><param name=\"movie\" value=\"\/images\/autoflash.swf\"><param name=wmode value=transparent><param name=\"quality\" value=\"high\">\');");
document.writeln("document.write(\'<param name=\"menu\" value=\"false\"><param name=wmode value=\"opaque\">\');");
document.writeln("document.write(\'<param name=\"FlashVars\" value=\"pics=\'+pics+\'&links=\'+links+\'&texts=\'+texts+\'&borderwidth=\'+focus_width+\'&borderheight=\'+focus_height+\'&textheight=\'+text_height+\'\">\');");
document.writeln("document.write(\'<embed src=\"\/images\/autoflash.swf\" wmode=\"opaque\" FlashVars=\"pics=\'+pics+\'&links=\'+links+\'&texts=\'+texts+\'&borderwidth=\'+focus_width+\'&borderheight=\'+focus_height+\'&textheight=\'+text_height+\'\" menu=\"false\" bgcolor=\"#ffffff\" quality=\"high\" width=\"\'+ focus_width +\'\" height=\"\'+ swf_height +\'\" allowScriptAccess=\"sameDomain\" type=\"application\/x-shockwave-flash\" pluginspage=\"http:\/\/www.macromedia.com\/go\/getflashplayer\" \/>\');");
document.writeln("document.write(\'<\/object>\');   <\/SCRIPT>")