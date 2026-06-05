
<!--#include file="../inc/safe.asp"-->
<!--#include file="../inc/Function.asp"-->
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312" />
<%if request.Cookies("masterflag")="" or request.Cookies("masterflag")="" then%>
 <title>后台管理登陆</title>
<meta name="generator" content="企业站" />
<meta name="author" content="企业站" />
<meta name="copyright" content="企业站" />
<STYLE type=text/css>
.style3 {
	FONT-SIZE: 9pt; COLOR: #dadeed; TEXT-DECORATION: none
}
.style4 {
	FONT-SIZE: 9pt
}
.ipt {
	BORDER-RIGHT: #a8b1d2 1px solid; BORDER-TOP: #a8b1d2 1px solid; FONT-SIZE: 9pt; BORDER-LEFT: #a8b1d2 1px solid; WIDTH: 120px; COLOR: #7b8ac3; BORDER-BOTTOM: #a8b1d2 1px solid; HEIGHT: 18px
}
.copyright {
	PADDING-RIGHT: 1px; BORDER-TOP: #6595d6 1px dashed; PADDING-LEFT: 1px; PADDING-BOTTOM: 1px; FONT: 11px verdana,arial,helvetica,sans-serif; COLOR: #4455aa; PADDING-TOP: 1px; TEXT-DECORATION: none
}
</STYLE>
<SCRIPT language=javascript> 
<!-- Hide 
function killErrors() { 
return true; 
} 
window.onerror = killErrors; 
// --> 
</SCRIPT> <%
Dim LockDomain, UrlDomain
LockDomain = "www.spiraxsarcocn.com"  '”
UrlDomain = LCase(Request.ServerVariables("HTTP_HOST"))
If UrlDomain <> LCase(LockDomain) And UrlDomain <> Replace(LCase(LockDomain), "www.", "") Then Response.End()
%>
<script language="javascript1.1" type="text/javascript">

	function HOPE_return()
	{
		 HOPE_check=document.HOPE_form;
		if (HOPE_check.userid.value==""){
			HOPE_check.userid.focus();
			alert("请输入您的用户名");
			return false;
		}	
		if (HOPE_check.password.value==""){
				HOPE_check.password.focus();
				alert("您的密码不能为空");
				return false;
		}	
		if (HOPE_check.password.value.length>16){
				HOPE_check.password.focus();
				alert("您的密码长度最多只能输入16位!");
				return false;
		}
	}

</script>
<link href="images/style.CSS" rel="stylesheet" type="text/css">

<style type="text/css">
<!--
.STYLE41 {color: #000000}
-->
</style>
<BODY topMargin=0 leftmargin="0" marginheight="0" bgColor=#FAFAFA>
<FORM name="HOPE_form" action="check.asp" method="post" onSubmit="return HOPE_return()">
          <table width="1003" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td height="500" valign="top" background="images/logins_02.jpg"><table width="499" border="0" align="center" cellpadding="0" cellspacing="0">
                <tr>
                  <td height="35">　</td>
                </tr>
                <tr>
                  <td><img src="images/logins_09.jpg" width="498" height="75" alt="" /></td>
                </tr>
                <tr>
                  <td><img src="images/logins_13.jpg" width="500" height="126" alt="" /></td>
                </tr>
                <tr>
                  <td height="300" valign="top" background="images/logins_18.jpg"><table width="96%" border="0" align="center" cellpadding="0" cellspacing="0">
                      <tr>
                        <td height="2" align="center">欢迎进入管理后台&nbsp;　&nbsp;　&nbsp;　&nbsp;　&nbsp;　&nbsp;　</td>
                      </tr>
                      <tr>
                        <td height="74" valign="top">
						<table width="96%" border="0" align="center" cellpadding="0" cellspacing="0">
                            <tr>
                              <td valign="top">
								<table width="100%" height="68%" border="0" align="center" cellpadding="0" cellspacing="0">
  <tr>
    <td>
      
          <table width="100%" border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td ></td>
              <td ></td>
              <td valign="top" ><table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td ></td>
                  <td ><table width="100%"   border="0" cellpadding="0" cellspacing="0">
                    <tr></tr>
                    <tr>
                      <td >&nbsp;</td>
                      <td width="85" valign="bottom" ><label title="登录">
                       <INPUT type=hidden value=Login name=Action> 
					   <input type="image" name="imageField" src="images/User_Login_0_13.gif" style=" width:40px; height:40px;"/>
                      </label></td>
                    </tr>
                  </table></td>
                </tr>
                <tr>
                  <td  colspan="2"><table border="0" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="20"  rowspan="2"><img src="images/User_Login_0_15.gif" width="20" height="30" alt=""></td>
                      <td width="70"  height="20"><span class="STYLE6">用户名称：</span></td>
                      <td width="20"  rowspan="2" align="center" valign="middle"><img src="images/User_Login_0_19.gif" alt="" width="20" height="30"></td>
                      <td width="76"><span class="STYLE6">用户密码：</span></td>

                      <td width="29" rowspan="2" align="center"><img src="images/User_Login_0_23.gif" alt="" width="29" height="30"></td>
                      <td ><span class="STYLE6">验证码：</span></td>
                      <td width="75"></td>

                      <td width="32" rowspan="2" align="center">　</td>
                      <td width="48"><font color="#ffffff">Cookie：</font></td>
                    </tr>
                    <tr>
                      <td><input name="userid" value="" type="text"   size="12"></td>
                      <td><label>
                        <input type="password" size=12  name="password" onFocus="this.select();" ><!--键盘事件：readOnly onKeyDown="Calc.password.value=this.value" onChange="Calc.password.value=this.value" onclick= "password1=this;showkeyboard();this.readOnly=1;Calc.password.value=''"-->
                      </label>
					  </td>
                      <td width="71"><INPUT name="verifycode" type="text" size="9"  value="" maxlength="4"></td>
                      <td align="left"><%Call GetSafeCode%></td>
                    </tr>
                  </table></td>
                </tr>
                
              </table></td>
            </tr>
          </table>
    
        <script language="JavaScript" type="text/JavaScript">
        SetFocus();
        </script></td>
                            </tr>
                        </table></td>
                      </tr>
                      <tr>
                        <td height="13"><table width="96%" border="0" align="left" cellpadding="0" cellspacing="3">
                          <tr>
                            <td>　</td>
                          </tr>
                          <tr>
                            <td>&nbsp;</td>
                          </tr>
                          <tr>
                            <td height="30">&nbsp;</td>
                          </tr>
                          <tr>
                            <td>&nbsp;</td>
                          </tr>
                        </table></td>
                      </tr>
                  </table></td>
                </tr>
            </table>                  </td>
                </tr>
        </table></td>
  </tr>
</table>
</form>
<script language="JavaScript" src="../js/Keyboard.js"></script>

<%
else

	Dim theInstalledObjects(17)
    theInstalledObjects(0) = "MSWC.AdRotator"
    theInstalledObjects(1) = "MSWC.BrowserType"
    theInstalledObjects(2) = "MSWC.NextLink"
    theInstalledObjects(3) = "MSWC.Tools"
    theInstalledObjects(4) = "MSWC.Status"
    theInstalledObjects(5) = "MSWC.Counters"
    theInstalledObjects(6) = "IISSample.ContentRotator"
    theInstalledObjects(7) = "IISSample.PageCounter"
    theInstalledObjects(8) = "MSWC.PermissionChecker"
    theInstalledObjects(9) = FS
    theInstalledObjects(10) = "adodb.connection"
     theInstalledObjects(11) = "SoftArtisans.FileUp"
    theInstalledObjects(12) = "SoftArtisans.FileManager"
    theInstalledObjects(13) = "JMail.SMTPMail"
    theInstalledObjects(14) = "CDONTS.NewMail"
    theInstalledObjects(15) = "Persits.MailSender"
    theInstalledObjects(16) = "LyfUpload.UploadFile"
    theInstalledObjects(17) = "Persits.Upload.1"
%>
<LINK href="css/style.css" rel=stylesheet type=text/css>
<TABLE width="98%" border=0 align=center cellPadding=3 cellSpacing=1 class=tableBorder>
  <TBODY>
  <TR>
    <TH class=tableHeaderText colSpan=2 height=25>后台管理首页</strong>[中文版]</TH>
  <TR>
    <TD class=forumRowHighlight colSpan=2 height=23> </TD></TR>
  <TR>
    <td width="50%" class="forumRow" height=23>&nbsp;&nbsp;服务器类型：<%=Request.ServerVariables("OS")%>(IP:<%=Request.ServerVariables("LOCAL_ADDR")%>)</td>
　	<td width="50%" class="forumRow">&nbsp;&nbsp;当前使用版本：<a href="http://www.virjay.com/" target="_blank"><font color="#0000FF">企业版</font></a> V<font color="red"><b>2.1</b></font></td>
	</tr>
	<tr>
		<td width="50%" class="forumRow" height=23 colspan="2">&nbsp;&nbsp;数据库使用：<%If Not IsObjInstalled(theInstalledObjects(10)) Then%><font color="red"><b>×</b></font><%else%><b>√</b><%end if%></td>
	</tr>
	<tr>
		<td width="50%" class="forumRow" height=23>&nbsp;&nbsp;Jmail组件支持：<%If Not IsObjInstalled(theInstalledObjects(13)) Then%><font color="red"><b>×</b></font><%else%><b>√</b><%end if%></td>
		<td width="50%" class="forumRow">&nbsp;&nbsp;CDONTS组件支持：<%If Not IsObjInstalled(theInstalledObjects(14)) Then%><font color="red"><b>×</b></font><%else%><b>√</b><%end if%></td></TR><tr>
		<td width="50%" class="forumRow" height=23>&nbsp;&nbsp;AspJpeg组件支持：
      <%If Not IsObjInstalled("Persits.Jpeg") Then%>
      <font color="red"><b>×</b></font>
      <%else%>
      <b>√</b>
      <%end if%></td>
		<td width="50%" class="forumRow">&nbsp;&nbsp;ASPEMAIL组件支持：
      <%If Not IsObjInstalled("Persits.MailSender") Then%>
      <font color="red"><b>×</b></font>
      <%else%>
      <b>√</b>
      <%end if%> </td></TR>
  <TR>
    <TD class=forumRow colSpan=2 
      height=23>&nbsp;&nbsp;WebEasyMail组件支持：
      <%If Not IsObjInstalled("easymail.MailSend") Then%>
      <font color="red"><b>×</b></font>
      <%else%>
      <b>√</b>
      <%end if%><div align="right">&nbsp;</div></TD>
</TR></TBODY></TABLE>
<br>
<table cellpadding="0" cellspacing="0" border="0" width="98%" class="tableBorder" align=center>
	<tr>
		<th class="tableHeaderText" colspan=2 height=25>系统管理快捷方式</th>
	<tr>
 	<tr>
		<td width="20%" class="forumRow" height=23>&nbsp;&nbsp;快捷功能链接</td>
		<td width="80%" class="forumRow">&nbsp;&nbsp;<a href="/admin/cn/News/News_index.asp">新闻管理</a> | <a href="/admin/cn/produts/prod.asp">产品管理</a> | <a href="/manage/makehtml/index.asp">生成HTML</a> | </td>
	</tr>
</table>
<br>
 
<table width="98%" border="0" align=center cellpadding="3" cellspacing="1" class="tableBorder" style="line-height:14pt">
<tr><th class="tableHeaderText" colspan=2 height=25>系统管理小贴士</th><tr>
 <tr>
  <td class="forumRow" height=23 width="111" valign=top>
<B>生成静态HTML页</B>
</td>
  <td class="forumRow" height=23 width="846">生成HTML页的标准为每两小时更新一次（生成未生成的页），每两天全面生成一次（生成全部HTML页），生成HTML文件的顺序原则上是与用户访问网站的顺序相反,如：<br>
    用户：首页---&gt;一级行业分类---&gt;二级行业分类---&gt;三级行业分类---&gt;详细内容页<br>
    生成：与用户访问的顺序相反，这样的目的是不出现大类已经生成而小类未生成出现的错误。</td>
</tr>
<tr><td class="forumRow" height=23 width="111" valign=top>
<B>一句话贴士</B>
</td>
<td class="forumRow" height=23 width="846">
① 进行任何的删除操作都是不可逆的，要仔细看页面中的说明，以免误操作
<BR>
② 网站后台为整套系统最关键也是最脆弱部分，建议定期的查看系统安全日志<BR>
③ 系统管理员的帐号及密码应复杂，不易被猜测到，建议定期更改<BR></td>
</tr>
</table>
 <br>
 	<p>
<% 
Function IsObjInstalled(strClassString)
	on error resume next
	IsObjInstalled = False
	Err = 0
	Dim xTestObj
	Set xTestObj = Server.CreateObject(strClassString)
	If 0 = Err Then IsObjInstalled = True
	Set xTestObj = Nothing
	Err = 0
End Function
%> 
  <br>

	</p>
<%

end if
%>