function addCookie()
{
 if (document.all)
    {
       window.external.addFavorite('http://idc.59599.cn/','企业系统');
    }
    else if (window.sidebar)
    {
       window.sidebar.addPanel('企业系统', 'http://idc.59599.cn/', "");
 }
}




function setHomepage()
{
 if (document.all)
    {
        document.body.style.behavior='url(#default#homepage)';
  document.body.setHomePage('http://idc.59599.cn/');
 
    }
    else if (window.sidebar)
    {
    if(window.netscape)
    {
         try
   {  
            netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");  
         }  
         catch (e)  
         {  
    alert( "该操作被浏览器拒绝，如果想启用该功能，请在地址栏内输入 about:config,然后将项 signed.applets.codebase_principal_support 值该为true" );  
         }
    } 
    var prefs = Components.classes['@mozilla.org/preferences-service;1'].getService(Components. interfaces.nsIPrefBranch);
    prefs.setCharPref('browser.startup.homepage','http://idc.59599.cn');
 }
}
