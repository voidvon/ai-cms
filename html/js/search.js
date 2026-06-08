//--检测搜索的安全性-->

	   function doSearch() {

	      var keywords = trim(document.searchForm.keywords.value);
		 // var direction = document.searchForm.direction.value;

          if(keywords == "") {
		    alert("请输入关键字！");
			document.searchForm.keywords.focus();
		    return false;
		  } 
		  
		  
		  
		 }

           function trim(inputString) {
	   
              if (typeof inputString != "string") { return inputString; }
              var retValue = inputString;
              var ch = retValue.substring(0, 1);
              while (ch == " ") { 
	          //检查字符串开始部分的空格
                  retValue = retValue.substring(1, retValue.length);
                  ch = retValue.substring(0, 1);
              }
              ch = retValue.substring(retValue.length-1, retValue.length);
              while (ch == " ") {
                 //检查字符串结束部分的空格
                 retValue = retValue.substring(0, retValue.length-1);
                 ch = retValue.substring(retValue.length-1, retValue.length);
              }
              while (retValue.indexOf("  ") != -1) { 
	         //将文字中间多个相连的空格变为一个空格
                 retValue = retValue.substring(0, retValue.indexOf("  ")) + retValue.substring(retValue.indexOf("  ")+1, retValue.length); 
              }
              return retValue;
           } 

//-->
	
