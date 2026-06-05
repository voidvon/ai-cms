<html>
<head>

<%
if request.Cookies("masterflag")="" or request.Cookies("masterflag")="" then
response.write "<script language='javascript'>"
response.write"parent.location.href='login.asp';</SCRIPT>" 
response.end
end if
%>
<title>企业站 - 系统管理</title>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<base target="main">
<html>
<head>
<title>顶部管理导航菜单</title>
<meta http-equiv='Content-Type' content='text/html; charset=gb2312'>
<style type='text/css'>
a:link { color:#ffffff;text-decoration:none}
a:hover {color:#ffffff;}
a:visited {color:#f0f0f0;text-decoration:none}
.spa {FONT-SIZE: 9pt; FILTER: Glow(Color=#0F42A6, Strength=2) dropshadow(Color=#0F42A6, OffX=2, OffY=1,); COLOR: #8AADE9; FONT-FAMILY: '宋体'}
img {filter:Alpha(opacity:100); chroma(color=#FFFFFF)}
.style4 {color: #CCFF00}
</style>
<base target='main'>
<script language='JavaScript' type='text/JavaScript'>
function preloadImg(src) {
  var img=new Image();
  img.src=src
}
preloadImg('Images/admin_top_open.gif');

var displayBar=true;
function switchBar(obj) {
  if (displayBar) {
    parent.frame.cols='0,*';
    displayBar=false;
    obj.src='Images/admin_top_open.gif';
    obj.title='打开左边管理导航菜单';
  } else {
    parent.frame.cols='200,*';
    displayBar=true;
    obj.src='Images/admin_top_close.gif';
    obj.title='关闭左边管理导航菜单';
  }
}
</script>
</head>

<body background='Images/admin_top_bg.gif' leftmargin='0' topmargin='0'>
<table width='100%' border='0' cellpadding='0' cellspacing='0'> <tr valign='top'>
    <td width=60><img onclick='switchBar(this)' src='Images/admin_top_close.gif' title='关闭左边管理导航菜单' style='cursor:hand'></td>
        <td width=92><a href='/index.html'  target='_blank'><img src='Images/top_an_2.gif' width="92" border='0' align="bottom"></a></td>
        <td width=92><a href='system/admin_AdminModifyPwd.asp'  target='main'><img src='Images/top_an_1.gif' width="92" border='0' align="bottom"></a></td>
    <td width=92><a href='http://idc.59599.cn/'  target='_blank'><img src='Images/top_an_6.gif' border='0'></a></td>
        <td width="673" align="left" valign="middle">
          </td>
  </tr>
</table>
</body>
</html>