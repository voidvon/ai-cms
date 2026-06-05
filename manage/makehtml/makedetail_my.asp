<%
if request.Cookies("masterflag")="" or request.Cookies("masterflag")="" then
	response.write "<script language='javascript'>"
	response.write"parent.location.href='../../../spck/login.asp';</SCRIPT>" 
	response.end
end if
 

'权限限制^^^^^^^^^^^^^^^^^^^^
 dim ishavegant
 ishavegant=false
 in_str=split(request.Cookies("masterflag"),",")
 for each ins in in_str
 if trim(ins)="010" then 
 ishavegant=true
 end if
 next 
 if ishavegant=false then
 response.redirect "../../../spck/err.asp"
 response.end
 end if
%>
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN"
"http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
	
<style type="text/css">
<!--
body {
	margin-left: 0px;
	margin-top: 0px;
	margin-right: 0px;
	margin-bottom: 0px;
}
.style1 {
	font-size: 16px;
	font-weight: bold;
	color: #FF0000;
}
-->
</style></head>

<body>
<LINK href="/spck/css/style.css" rel=stylesheet type=text/css>

  <table border="0" cellspacing="1" cellpadding="3" align=center class="tableBorder"> 
    <tr> 
      <th height=25 colspan="2" class="tableHeaderText">批量生成详细内容页</th> 
    </tr> 
    <tr> 
      <td width="16%" height=40 class="forumRowHighlight"><strong>生成新闻:</strong></td> 
      <td width="84%" class="forumRowHighlight">
	  <form name='form1' method='post' action='News/makedetail.asp' target="main">
        开始ID：
        <label>
        <input name="id1" type="text" id="id1" value="1" size="10" maxlength="10">
        </label>
结束ID：
<input name="id2" type="text" id="id2" value="1000" size="10" maxlength="10">
<input name="schtml" type="submit" id="schtml" value="开始生成>>">&nbsp;
      </form></td>
    </tr>
    <tr>
      <td height=40 class="forumRowHighlight"><strong>生成服务:</strong></td>
      <td class="forumRowHighlight">
	  <form name='form1' method='post' action='service/makedetail.asp' target="main">
        开始ID：
        <label>
        <input name="id1" type="text" id="id1" value="1" size="10" maxlength="10">
        </label>
结束ID：
<input name="id2" type="text" id="id2" value="1000" size="10" maxlength="10">
<input name="schtml" type="submit" id="schtml" value="开始生成>>">&nbsp;
      </form>	  </td>
    </tr>
    
   
    <tr>
      <td align="center"  class="forumRowHighlight"><div align="left"><strong>生成产品:</strong></div></td>
      <td   class="forumRowHighlight">
	  <form name='form1' method='post' action='prod/makedetail.asp' target="main">
        开始ID：
        <label>
        <input name="id1" type="text" id="id1" value="1" size="10" maxlength="10">
        </label>
结束ID：
<input name="id2" type="text" id="id2" value="1000" size="10" maxlength="10">
<input name="schtml" type="submit" id="schtml" value="开始生成>>">&nbsp;
      </form></td>
    </tr>
    <tr>
      <td align="center"  class="forumRowHighlight"><div align="left"><strong>生成招聘:</strong></div></td>
      <td   class="forumRowHighlight">
	  <form name='form1' method='post' action='job/makedetail.asp' target="main">
        开始ID：
        <label>
        <input name="id1" type="text" id="id1" value="1" size="10" maxlength="10">
        </label>
结束ID：
<input name="id2" type="text" id="id2" value="1000" size="10" maxlength="10">
<input name="schtml" type="submit" id="schtml" value="开始生成>>">&nbsp;
      </form></td>
    </tr>
    <tr>
      <td colspan="2" align="center" bgcolor="#E4EDF9"><br>  <a href="#" onClick="javascript:history.back(-1);">返回</a> <br></td>
    </tr>
</table> 
<br>
</body>
</html>

